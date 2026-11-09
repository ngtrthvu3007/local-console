import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type _Object,
  type CommonPrefix,
  type DeleteMarkerEntry,
  type ObjectVersion,
} from "@aws-sdk/client-s3";
import { MAX_KEYS_PER_PAGE, PATH_DELIMITER } from "../constants.ts";
import { asFolderKey } from "../helpers.ts";
import {
  copyObjects,
  deleteObjects,
  expandToKeys,
  type CopyPair,
  type ObjectReference,
} from "../operations.ts";
import { useS3 } from "./useS3.ts";

// Tiền tố của mọi query object trong bucket: làm mới nó là làm mới danh sách, version, chi tiết
export const objectsQueryKey = (bucket: string) => ["s3", "objects", bucket];

// Danh sách object hoặc danh sách version của bucket (không gồm chi tiết từng object)
const OBJECT_LISTS = { objects: "list", versions: "versions" } as const;
const objectListQueryKey = (bucket: string, list: string) => [...objectsQueryKey(bucket), list];

export interface ObjectRow extends ObjectReference {
  name: string; // phần key sau prefix đang xem
  size?: number;
  lastModified?: Date;
  versionId?: string;
  isLatest?: boolean;
  isDeleteMarker?: boolean;
}

export interface BulkResult {
  count: number;
  failures: string[];
}

const folderRow = (entry: CommonPrefix, currentPrefix: string): ObjectRow => ({
  key: entry.Prefix!,
  name: entry.Prefix!.slice(currentPrefix.length),
  isFolder: true,
});

// Dùng cho object, version và delete marker (marker không có Size)
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

export function useObjects(bucket: string, prefix: string, search: string, enabled = true) {
  const { s3 } = useS3();
  const listPrefix = prefix + search;
  return useInfiniteQuery({
    queryKey: [...objectListQueryKey(bucket, OBJECT_LISTS.objects), listPrefix],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: listPrefix,
          Delimiter: PATH_DELIMITER,
          MaxKeys: MAX_KEYS_PER_PAGE,
          ContinuationToken: pageParam,
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
    },
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });
}

interface VersionMarker {
  keyMarker?: string;
  versionIdMarker?: string;
}

export function useObjectVersions(
  bucket: string,
  prefix: string,
  search: string,
  enabled: boolean,
) {
  const { s3 } = useS3();
  const listPrefix = prefix + search;
  return useInfiniteQuery({
    queryKey: [...objectListQueryKey(bucket, OBJECT_LISTS.versions), listPrefix],
    enabled,
    initialPageParam: undefined as VersionMarker | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await s3.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: listPrefix,
          Delimiter: PATH_DELIMITER,
          MaxKeys: MAX_KEYS_PER_PAGE,
          KeyMarker: pageParam?.keyMarker,
          VersionIdMarker: pageParam?.versionIdMarker,
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
    },
    getNextPageParam: (lastPage) => lastPage.nextMarker,
  });
}

// Trả promise để mutation chờ bảng tải lại xong mới hết pending:
// nút còn loading tới khi modal đóng và bảng đã có dữ liệu mới cùng lúc
export function useInvalidateObjects() {
  const queryClient = useQueryClient();
  return (...buckets: string[]) =>
    Promise.all(
      buckets.map((bucket) => queryClient.invalidateQueries({ queryKey: objectsQueryKey(bucket) })),
    );
}

const EMPTY_OBJECT_BODY = "";

export function useCreateFolder(bucket: string) {
  const { s3 } = useS3();
  const invalidate = useInvalidateObjects();
  return useMutation({
    // Folder là object rỗng; khai báo độ dài 0 để SDK không cảnh báo body không rõ kích thước
    mutationFn: (key: string) =>
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: asFolderKey(key),
          Body: EMPTY_OBJECT_BODY,
          ContentLength: EMPTY_OBJECT_BODY.length,
        }),
      ),
    onSuccess: () => invalidate(bucket),
  });
}

export function useDeleteObjects(bucket: string) {
  const { s3 } = useS3();
  const queryClient = useQueryClient();
  // Chỉ làm mới các danh sách: chi tiết của object vừa xóa sẽ 404, trang chi tiết
  // đổi sang "not found" và gỡ modal trước khi kịp chuyển về folder
  const invalidateLists = () =>
    Promise.all(
      Object.values(OBJECT_LISTS).map((list) =>
        queryClient.invalidateQueries({ queryKey: objectListQueryKey(bucket, list) }),
      ),
    );
  return useMutation({
    mutationFn: async (rows: ObjectRow[]): Promise<BulkResult> => {
      // Dòng có versionId (đang xem version) thì xóa vĩnh viễn đúng version đó
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
    },
    onSuccess: invalidateLists,
  });
}

interface TransferInput {
  rows: ObjectRow[];
  sourcePrefix: string; // giữ đường dẫn tương đối khi copy folder
  destinationBucket: string;
  destinationPrefix: string;
  move: boolean;
  newName?: string; // chỉ khi đổi tên một mục
}

async function planCopies(
  expand: (row: ObjectRow) => Promise<string[]>,
  { rows, sourcePrefix, destinationPrefix, newName }: TransferInput,
): Promise<CopyPair[]> {
  const pairs: CopyPair[] = [];
  for (const row of rows) {
    const renamedKey = newName
      ? sourcePrefix + (row.isFolder ? asFolderKey(newName) : newName)
      : undefined;
    for (const key of await expand(row)) {
      const to = renamedKey
        ? renamedKey + key.slice(row.key.length)
        : destinationPrefix + key.slice(sourcePrefix.length);
      pairs.push({ from: key, to });
    }
  }
  return pairs;
}

// S3 không có rename/move: copy rồi xóa bản gốc
export function useTransfer(bucket: string) {
  const { s3 } = useS3();
  const invalidate = useInvalidateObjects();
  return useMutation({
    mutationFn: async (input: TransferInput): Promise<BulkResult> => {
      const plannedPairs = await planCopies((row) => expandToKeys(s3, bucket, [row]), input);
      const pairs = plannedPairs.filter(
        (pair) => pair.from !== pair.to || input.destinationBucket !== bucket,
      );
      const failures = await copyObjects(s3, bucket, input.destinationBucket, pairs);
      if (input.move) {
        const copied = pairs.filter(
          (pair) => !failures.some((failure) => failure.startsWith(`${pair.from}:`)),
        );
        const originals = copied.map((pair) => ({ Key: pair.from }));
        failures.push(...(await deleteObjects(s3, bucket, originals)));
      }
      return { count: pairs.length - failures.length, failures };
    },
    onSuccess: (_result, input) => invalidate(bucket, input.destinationBucket),
  });
}
