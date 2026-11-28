import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBucketInput, DeleteBucketInput } from "@localconsole/core/s3";
import { existsUnlessMissing } from "@localconsole/core/shared";
import { objectsQueryKey } from "./useObjects.ts";
import { useS3Service } from "./useS3Service.ts";

const bucketsQueryKey = ["s3", "buckets"];
// Mọi query về một bucket (tồn tại, cấu hình…) nằm dưới key này
export const bucketQueryKey = (bucket: string, part: string) => ["s3", "bucket", bucket, part];

export function useBuckets() {
  const s3 = useS3Service();

  return useQuery({ queryKey: bucketsQueryKey, queryFn: s3.listBuckets });
}

export function useBucketExists(bucket: string) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: bucketQueryKey(bucket, "exists"),
    queryFn: () => existsUnlessMissing(() => s3.headBucket(bucket)),
  });
}

export function useBucketHasObjects(bucket: string, enabled: boolean) {
  const s3 = useS3Service();

  return useQuery({
    queryKey: bucketQueryKey(bucket, "has-objects"),
    enabled,
    staleTime: 0,
    queryFn: () => s3.bucketHasObjects(bucket),
  });
}

export function useCreateBucket() {
  const s3 = useS3Service();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBucketInput) => s3.createBucket(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketsQueryKey }),
  });
}

export function useEmptyBucket() {
  const s3 = useS3Service();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: s3.emptyBucket,
    onSuccess: (_deleted, bucket) =>
      queryClient.invalidateQueries({ queryKey: objectsQueryKey(bucket) }),
  });
}

export function useDeleteBucket() {
  const s3 = useS3Service();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteBucketInput) => s3.deleteBucket(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketsQueryKey }),
  });
}
