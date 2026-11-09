import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";
import { isNotFoundError } from "@shared/aws.ts";
import type { Tag } from "@shared/components/TagsModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { REGION_WITHOUT_LOCATION_CONSTRAINT, VERSIONING_STATUS } from "../constants.ts";
import { toS3TagSet } from "../helpers.ts";
import { deleteAllVersions } from "../operations.ts";
import { objectsQueryKey } from "./useObjects.ts";
import { useS3 } from "./useS3.ts";

const bucketsQueryKey = ["s3", "buckets"];
// Mọi query về một bucket (tồn tại, cấu hình…) nằm dưới key này
export const bucketQueryKey = (bucket: string, part: string) => ["s3", "bucket", bucket, part];

export function useBuckets() {
  const { s3 } = useS3();
  return useQuery({
    queryKey: bucketsQueryKey,
    queryFn: async () => (await s3.send(new ListBucketsCommand({}))).Buckets ?? [],
  });
}

export function useBucketExists(bucket: string) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: bucketQueryKey(bucket, "exists"),
    queryFn: async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throw error;
      }
    },
  });
}

export function useBucketHasObjects(bucket: string, enabled: boolean) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: bucketQueryKey(bucket, "has-objects"),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, MaxKeys: 1 }));
      return Boolean(page.Versions?.length || page.DeleteMarkers?.length);
    },
  });
}

interface CreateBucketInput {
  name: string;
  versioning: boolean;
  tags: Tag[];
}

export function useCreateBucket() {
  const { s3 } = useS3();
  const { region } = useLoadedConfig();
  const queryClient = useQueryClient();
  const needsLocation = region !== REGION_WITHOUT_LOCATION_CONSTRAINT;

  return useMutation({
    mutationFn: async ({ name, versioning, tags }: CreateBucketInput) => {
      const createBucketConfiguration = needsLocation
        ? { LocationConstraint: region as BucketLocationConstraint }
        : undefined;
      await s3.send(
        new CreateBucketCommand({
          Bucket: name,
          CreateBucketConfiguration: createBucketConfiguration,
        }),
      );
      if (versioning) {
        await s3.send(
          new PutBucketVersioningCommand({
            Bucket: name,
            VersioningConfiguration: { Status: VERSIONING_STATUS.enabled },
          }),
        );
      }
      if (tags.length) {
        await s3.send(
          new PutBucketTaggingCommand({ Bucket: name, Tagging: { TagSet: toS3TagSet(tags) } }),
        );
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketsQueryKey }),
  });
}

export function useEmptyBucket() {
  const { s3 } = useS3();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bucket: string) => deleteAllVersions(s3, bucket),
    onSuccess: (_deleted, bucket) =>
      queryClient.invalidateQueries({ queryKey: objectsQueryKey(bucket) }),
  });
}

export function useDeleteBucket() {
  const { s3 } = useS3();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bucket, emptyFirst }: { bucket: string; emptyFirst: boolean }) => {
      if (emptyFirst) await deleteAllVersions(s3, bucket);
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketsQueryKey }),
  });
}
