import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  paginateListObjectsV2,
  type ObjectIdentifier,
  type S3Client,
} from "@aws-sdk/client-s3";
import { MAX_KEYS_PER_DELETE } from "./constants.ts";
import { copySource } from "./helpers.ts";

// Thao tác S3 nhiều bước dùng chung cho các hook

export interface ObjectReference {
  key: string;
  isFolder: boolean;
}

export async function listKeysUnder(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  for await (const page of paginateListObjectsV2(
    { client: s3 },
    { Bucket: bucket, Prefix: prefix },
  )) {
    keys.push(...(page.Contents ?? []).map((object) => object.Key!));
  }
  return keys;
}

export interface BucketTotals {
  objectCount: number;
  totalBytes: number;
}

// Chỉ đếm bản hiện tại của object, giống "Calculate total size" của AWS
export async function bucketTotals(s3: S3Client, bucket: string): Promise<BucketTotals> {
  const totals: BucketTotals = { objectCount: 0, totalBytes: 0 };
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: bucket })) {
    for (const object of page.Contents ?? []) {
      totals.objectCount++;
      totals.totalBytes += object.Size ?? 0;
    }
  }
  return totals;
}

// Folder được mở thành mọi key bên trong
export async function expandToKeys(s3: S3Client, bucket: string, references: ObjectReference[]) {
  const keys: string[] = [];
  for (const reference of references) {
    if (reference.isFolder) keys.push(...(await listKeysUnder(s3, bucket, reference.key)));
    else keys.push(reference.key);
  }
  return keys;
}

// Trả danh sách lỗi dạng "key: lý do"
export async function deleteObjects(
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

export interface CopyPair {
  from: string;
  to: string;
}

export async function copyObjects(
  s3: S3Client,
  sourceBucket: string,
  destinationBucket: string,
  pairs: CopyPair[],
) {
  const failures: string[] = [];
  for (const { from, to } of pairs) {
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: destinationBucket,
          Key: to,
          CopySource: copySource(sourceBucket, from),
        }),
      );
    } catch (error) {
      failures.push(`${from}: ${(error as Error).message}`);
    }
  }
  return failures;
}
