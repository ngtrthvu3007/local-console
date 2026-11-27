import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  paginateListObjectsV2,
  type _Object,
  type CommonPrefix,
  type DeleteMarkerEntry,
  type ObjectIdentifier,
  type ObjectVersion,
  type S3Client,
} from "@aws-sdk/client-s3";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { MAX_KEYS_PER_DELETE, MAX_KEYS_PER_PAGE, PATH_DELIMITER } from "#services/s3/constants.ts";
import { asFolderKey, copySource } from "#services/s3/helpers.ts";

export interface ObjectReference {
  key: string;
  isFolder: boolean;
}

export interface ObjectRow extends ObjectReference {
  name: string; // phần key sau prefix đang xem
  size?: number;
  lastModified?: Date;
  versionId?: string;
  isLatest?: boolean;
  isDeleteMarker?: boolean;
}

export interface ObjectListInput {
  bucket: string;
  prefix: string;
  search: string;
}

export interface VersionMarker {
  keyMarker?: string;
  versionIdMarker?: string;
}

export interface TransferInput {
  rows: ObjectRow[];
  sourcePrefix: string; // giữ đường dẫn tương đối khi copy folder
  destinationBucket: string;
  destinationPrefix: string;
  move: boolean;
  newName?: string; // chỉ khi đổi tên một mục
}

interface CopyPair {
  from: string;
  to: string;
}

const folderRow = (entry: CommonPrefix, currentPrefix: string): ObjectRow => ({
  key: entry.Prefix!,
  name: entry.Prefix!.slice(currentPrefix.length),
  isFolder: true,
});

// Marker không có Size
const objectRow = (
  entry: _Object | ObjectVersion | DeleteMarkerEntry,
  currentPrefix: string,
  isDeleteMarker?: boolean,
): ObjectRow => ({
  key: entry.Key!,
  name: entry.Key!.slice(currentPrefix.length),
  isFolder: false,
  size: "Size" in entry ? entry.Size : undefined,
  lastModified: entry.LastModified,
  versionId: "VersionId" in entry ? entry.VersionId : undefined,
  isLatest: "IsLatest" in entry ? entry.IsLatest : undefined,
  isDeleteMarker,
});

const byKeyThenNewest = (left: ObjectRow, right: ObjectRow) =>
  left.key.localeCompare(right.key) ||
  (right.lastModified?.getTime() ?? 0) - (left.lastModified?.getTime() ?? 0);

export async function listObjectRows(
  s3: S3Client,
  { bucket, prefix, search }: ObjectListInput,
  token?: string,
) {
  const page = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix + search,
      Delimiter: PATH_DELIMITER,
      MaxKeys: MAX_KEYS_PER_PAGE,
      ContinuationToken: token,
    }),
  );
  const folders = (page.CommonPrefixes ?? []).map((entry) => folderRow(entry, prefix));
  const files = (page.Contents ?? [])
    .filter((object) => object.Key !== prefix) // object rỗng đánh dấu chính folder đang xem
    .map((object) => objectRow(object, prefix));

  return {
    rows: [...folders, ...files],
    nextToken: page.IsTruncated ? page.NextContinuationToken : undefined,
  };
}

export async function listVersionRows(
  s3: S3Client,
  { bucket, prefix, search }: ObjectListInput,
  marker?: VersionMarker,
) {
  const page = await s3.send(
    new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: prefix + search,
      Delimiter: PATH_DELIMITER,
      MaxKeys: MAX_KEYS_PER_PAGE,
      KeyMarker: marker?.keyMarker,
      VersionIdMarker: marker?.versionIdMarker,
    }),
  );
  const folders = (page.CommonPrefixes ?? []).map((entry) => folderRow(entry, prefix));
  const versions = [
    ...(page.Versions ?? []).map((entry) => objectRow(entry, prefix, false)),
    ...(page.DeleteMarkers ?? []).map((entry) => objectRow(entry, prefix, true)),
  ]
    .filter((row) => row.key !== prefix)
    .sort(byKeyThenNewest);
  const nextMarker: VersionMarker | undefined = page.IsTruncated
    ? { keyMarker: page.NextKeyMarker, versionIdMarker: page.NextVersionIdMarker }
    : undefined;

  return { rows: [...folders, ...versions], nextMarker };
}

const EMPTY_OBJECT_BODY = "";

// Folder là object rỗng; khai báo độ dài 0 để SDK không cảnh báo body không rõ kích thước
export const createFolder = (s3: S3Client, bucket: string, key: string) =>
  s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: asFolderKey(key),
      Body: EMPTY_OBJECT_BODY,
      ContentLength: EMPTY_OBJECT_BODY.length,
    }),
  );

const listKeysUnder = async (s3: S3Client, bucket: string, prefix: string) =>
  (
    await collectPages(
      paginateListObjectsV2({ client: s3 }, { Bucket: bucket, Prefix: prefix }),
      (page) => page.Contents,
    )
  ).map((object) => object.Key!);

async function expandToKeys(s3: S3Client, bucket: string, references: readonly ObjectReference[]) {
  const keys: string[] = [];

  for (const reference of references) {
    if (reference.isFolder) keys.push(...(await listKeysUnder(s3, bucket, reference.key)));
    else keys.push(reference.key);
  }

  return keys;
}

// Trả danh sách lỗi dạng "key: lý do"
async function deleteObjects(
  s3: S3Client,
  bucket: string,
  objects: ObjectIdentifier[],
): Promise<string[]> {
  const failures: string[] = [];

  for (let start = 0; start < objects.length; start += MAX_KEYS_PER_DELETE) {
    const batch = objects.slice(start, start + MAX_KEYS_PER_DELETE);

    const result = await s3.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }),
    );

    failures.push(...(result.Errors ?? []).map((failure) => `${failure.Key}: ${failure.Message}`));
  }

  return failures;
}

// Xóa mọi version và delete marker (bucket chưa bật versioning có version "null")
export async function deleteAllVersions(s3: S3Client, bucket: string): Promise<number> {
  let deleted = 0;
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );

    const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].map((version) => ({
      Key: version.Key!,
      VersionId: version.VersionId,
    }));

    const failures = await deleteObjects(s3, bucket, objects);
    if (failures.length) throw new Error(failures[0]);
    deleted += objects.length;
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);

  return deleted;
}

// Dòng có versionId (đang xem version) thì xóa vĩnh viễn đúng version đó; folder mở thành mọi key bên trong
export async function deleteObjectRows(s3: S3Client, bucket: string, rows: readonly ObjectRow[]) {
  const versions = rows
    .filter((row) => row.versionId)
    .map((row) => ({ Key: row.key, VersionId: row.versionId }));
  const keys = await expandToKeys(
    s3,
    bucket,
    rows.filter((row) => !row.versionId),
  );
  const objects = [...versions, ...keys.map((key) => ({ Key: key }))];
  const failures = await deleteObjects(s3, bucket, objects);

  return { count: objects.length - failures.length, failures };
}

async function planCopies(
  s3: S3Client,
  bucket: string,
  { rows, sourcePrefix, destinationPrefix, newName }: TransferInput,
): Promise<CopyPair[]> {
  const pairs: CopyPair[] = [];

  for (const row of rows) {
    const renamedKey = newName
      ? sourcePrefix + (row.isFolder ? asFolderKey(newName) : newName)
      : undefined;
    const keys = await expandToKeys(s3, bucket, [row]);
    pairs.push(
      ...keys.map((key) => ({
        from: key,
        to: renamedKey
          ? renamedKey + key.slice(row.key.length)
          : destinationPrefix + key.slice(sourcePrefix.length),
      })),
    );
  }

  return pairs;
}

// Lỗi dạng "from: …": transfer dựa vào tiền tố này để chỉ xóa bản gốc đã copy xong
async function copyObjects(
  s3: S3Client,
  sourceBucket: string,
  destinationBucket: string,
  pairs: CopyPair[],
) {
  const { failures } = await runEach(
    pairs,
    (pair) => pair.from,
    ({ from, to }) =>
      s3.send(
        new CopyObjectCommand({
          Bucket: destinationBucket,
          Key: to,
          CopySource: copySource(sourceBucket, from),
        }),
      ),
  );

  return failures;
}

// S3 không có rename/move: copy rồi xóa bản gốc
export async function transferObjects(s3: S3Client, bucket: string, input: TransferInput) {
  const pairs = (await planCopies(s3, bucket, input)).filter(
    (pair) => pair.from !== pair.to || input.destinationBucket !== bucket,
  );
  const failures = await copyObjects(s3, bucket, input.destinationBucket, pairs);

  if (input.move) {
    const copied = pairs.filter(
      (pair) => !failures.some((failure) => failure.startsWith(`${pair.from}:`)),
    );
    failures.push(
      ...(await deleteObjects(
        s3,
        bucket,
        copied.map((pair) => ({ Key: pair.from })),
      )),
    );
  }

  return { count: pairs.length - failures.length, failures };
}
