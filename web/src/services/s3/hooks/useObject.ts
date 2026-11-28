import { useMutation, useQuery } from "@tanstack/react-query";
import type { MetadataInput, ObjectTagsInput, VersionReference } from "@localconsole/core/s3";
import { objectsQueryKey, useInvalidateObjects } from "./useObjects.ts";
import { useS3Service } from "./useS3Service.ts";

// Nằm dưới key objects của bucket, nên làm mới cả bucket cũng làm mới chi tiết
const objectQueryKey = (bucket: string, key: string, part: string) => [
  ...objectsQueryKey(bucket),
  "object",
  key,
  part,
];

export function useHeadObject(bucket: string, key: string) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: objectQueryKey(bucket, key, "head"),
    queryFn: () => s3.headObject(bucket, key),
    retry: false,
  });
}

export function useTextContent(bucket: string, key: string, enabled: boolean) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: objectQueryKey(bucket, key, "text"),
    enabled,
    queryFn: () => s3.getObjectText(bucket, key),
  });
}

export function useObjectHistory(bucket: string, key: string) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: objectQueryKey(bucket, key, "versions"),
    queryFn: () => s3.getObjectHistory(bucket, key),
  });
}

// enabled=false khi chưa biết object còn tồn tại (object đã xóa thì S3 trả 405)
export function useObjectTags(bucket: string, key: string, enabled = true) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: objectQueryKey(bucket, key, "tags"),
    enabled,
    queryFn: () => s3.getObjectTags(bucket, key),
  });
}

export function usePutObjectTags(bucket: string) {
  const s3 = useS3Service();
  const invalidate = useInvalidateObjects();

  return useMutation({
    mutationFn: (input: ObjectTagsInput) => s3.putObjectTags(bucket, input),
    onSuccess: () => invalidate(bucket),
  });
}

export function useEditMetadata(bucket: string) {
  const s3 = useS3Service();
  const invalidate = useInvalidateObjects();

  return useMutation({
    mutationFn: (input: MetadataInput) => s3.editMetadata(bucket, input),
    onSuccess: () => invalidate(bucket),
  });
}

export function useRestoreVersion(bucket: string) {
  const s3 = useS3Service();
  const invalidate = useInvalidateObjects();

  return useMutation({
    mutationFn: (version: VersionReference) => s3.restoreVersion(bucket, version),
    onSuccess: () => invalidate(bucket),
  });
}
