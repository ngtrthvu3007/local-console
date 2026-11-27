import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ObjectRow, TransferInput, VersionMarker } from "@localconsole/core/s3";
import { useS3Service } from "./useS3Service.ts";

// Tiền tố của mọi query object trong bucket: làm mới nó là làm mới danh sách, version, chi tiết
export const objectsQueryKey = (bucket: string) => ["s3", "objects", bucket];

const OBJECT_LISTS = { objects: "list", versions: "versions" } as const;
const objectListQueryKey = (bucket: string, list: string) => [...objectsQueryKey(bucket), list];

export function useObjects(bucket: string, prefix: string, search: string, enabled = true) {
  const s3 = useS3Service();

  return useInfiniteQuery({
    queryKey: [...objectListQueryKey(bucket, OBJECT_LISTS.objects), prefix + search],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => s3.listObjectRows({ bucket, prefix, search }, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });
}

export function useObjectVersions(
  bucket: string,
  prefix: string,
  search: string,
  enabled: boolean,
) {
  const s3 = useS3Service();

  return useInfiniteQuery({
    queryKey: [...objectListQueryKey(bucket, OBJECT_LISTS.versions), prefix + search],
    enabled,
    initialPageParam: undefined as VersionMarker | undefined,
    queryFn: ({ pageParam }) => s3.listVersionRows({ bucket, prefix, search }, pageParam),
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

export function useCreateFolder(bucket: string) {
  const s3 = useS3Service();
  const invalidate = useInvalidateObjects();

  return useMutation({
    mutationFn: (key: string) => s3.createFolder(bucket, key),
    onSuccess: () => invalidate(bucket),
  });
}

export function useDeleteObjects(bucket: string) {
  const s3 = useS3Service();
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
    mutationFn: (rows: ObjectRow[]) => s3.deleteObjectRows(bucket, rows),
    onSuccess: invalidateLists,
  });
}

export function useTransfer(bucket: string) {
  const s3 = useS3Service();
  const invalidate = useInvalidateObjects();

  return useMutation({
    mutationFn: (input: TransferInput) => s3.transferObjects(bucket, input),
    onSuccess: (_result, input) => invalidate(bucket, input.destinationBucket),
  });
}
