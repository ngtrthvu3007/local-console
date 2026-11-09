import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AbortMultipartUploadCommand,
  DeleteBucketCorsCommand,
  DeleteBucketLifecycleCommand,
  DeleteBucketPolicyCommand,
  DeleteBucketTaggingCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLocationCommand,
  GetBucketNotificationConfigurationCommand,
  GetBucketPolicyCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  ListMultipartUploadsCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  PutBucketPolicyCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  type CORSRule,
  type LifecycleRule,
  type NotificationConfiguration,
} from "@aws-sdk/client-s3";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import type { Tag } from "@shared/components/TagsModal.tsx";
import { bucketQueryKey } from "./useBuckets.ts";
import { useS3 } from "./useS3.ts";
import {
  REGION_WITHOUT_LOCATION_CONSTRAINT,
  VERSIONING_STATUS,
  type VersioningStatus,
} from "../constants.ts";
import { fromS3TagSet, toS3TagSet } from "../helpers.ts";
import { bucketTotals } from "../operations.ts";

const SETTINGS = {
  region: "region",
  versioning: "versioning",
  tags: "tags",
  policy: "policy",
  cors: "cors",
  notifications: "notifications",
  multipartUploads: "multipart-uploads",
  totalSize: "total-size",
  lifecycle: "lifecycle",
} as const;
type Setting = (typeof SETTINGS)[keyof typeof SETTINGS];

// Đọc một cấu hình của bucket
function useBucketSetting<T>(bucket: string, setting: Setting, read: () => Promise<T>) {
  return useQuery({ queryKey: bucketQueryKey(bucket, setting), queryFn: read });
}

// Ghi một cấu hình rồi làm mới đúng cấu hình đó
function useBucketSettingMutation<TInput>(
  bucket: string,
  setting: Setting,
  write: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketQueryKey(bucket, setting) }),
  });
}

// Duyệt cả bucket nên chỉ chạy khi người dùng bấm (refetch), không tự chạy khi mở tab
export function useBucketTotalSize(bucket: string) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: bucketQueryKey(bucket, SETTINGS.totalSize),
    queryFn: () => bucketTotals(s3, bucket),
    enabled: false,
  });
}

export function useBucketRegion(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.region, async () => {
    const response = await s3.send(new GetBucketLocationCommand({ Bucket: bucket }));
    return response.LocationConstraint || REGION_WITHOUT_LOCATION_CONSTRAINT;
  });
}

export function useVersioning(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.versioning, async (): Promise<VersioningStatus> => {
    const response = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    return response.Status ?? VERSIONING_STATUS.disabled;
  });
}

// Chưa tải xong thì coi như chưa bật
export function useIsVersioned(bucket: string) {
  const status = useVersioning(bucket).data ?? VERSIONING_STATUS.disabled;
  return status !== VERSIONING_STATUS.disabled;
}

export function useSetVersioning(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(
    bucket,
    SETTINGS.versioning,
    (status: Exclude<VersioningStatus, "Disabled">) =>
      s3.send(
        new PutBucketVersioningCommand({
          Bucket: bucket,
          VersioningConfiguration: { Status: status },
        }),
      ),
  );
}

export function useBucketTags(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.tags, () =>
    orEmptyWhenNotFound(
      async () =>
        fromS3TagSet((await s3.send(new GetBucketTaggingCommand({ Bucket: bucket }))).TagSet),
      [] as Tag[],
    ),
  );
}

export function useSaveBucketTags(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(bucket, SETTINGS.tags, (tags: Tag[]) =>
    tags.length
      ? s3.send(
          new PutBucketTaggingCommand({ Bucket: bucket, Tagging: { TagSet: toS3TagSet(tags) } }),
        )
      : s3.send(new DeleteBucketTaggingCommand({ Bucket: bucket })),
  );
}

export function useBucketPolicy(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.policy, () =>
    orEmptyWhenNotFound(
      async () => (await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }))).Policy ?? null,
      null as string | null,
    ),
  );
}

// null = xóa policy
export function useSaveBucketPolicy(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(bucket, SETTINGS.policy, (policy: string | null) =>
    policy
      ? s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
      : s3.send(new DeleteBucketPolicyCommand({ Bucket: bucket })),
  );
}

export function useBucketCors(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.cors, () =>
    orEmptyWhenNotFound(
      async () => (await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? null,
      null as CORSRule[] | null,
    ),
  );
}

// null hoặc mảng rỗng = xóa CORS
export function useSaveBucketCors(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(bucket, SETTINGS.cors, (rules: CORSRule[] | null) =>
    rules?.length
      ? s3.send(
          new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }),
        )
      : s3.send(new DeleteBucketCorsCommand({ Bucket: bucket })),
  );
}

export function useLifecycleRules(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(bucket, SETTINGS.lifecycle, () =>
    orEmptyWhenNotFound(
      async () =>
        (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules ?? [],
      [] as LifecycleRule[],
    ),
  );
}

// S3 không có API sửa từng rule: ghi lại toàn bộ, hết rule thì xóa cấu hình
export function useSaveLifecycleRules(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(bucket, SETTINGS.lifecycle, (rules: LifecycleRule[]) =>
    rules.length
      ? s3.send(
          new PutBucketLifecycleConfigurationCommand({
            Bucket: bucket,
            LifecycleConfiguration: { Rules: rules },
          }),
        )
      : s3.send(new DeleteBucketLifecycleCommand({ Bucket: bucket })),
  );
}

export function useBucketNotifications(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(
    bucket,
    SETTINGS.notifications,
    async (): Promise<NotificationConfiguration> => {
      const { $metadata: _metadata, ...configuration } = await s3.send(
        new GetBucketNotificationConfigurationCommand({ Bucket: bucket }),
      );
      return configuration;
    },
  );
}

export function useSaveBucketNotifications(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(
    bucket,
    SETTINGS.notifications,
    (configuration: NotificationConfiguration) =>
      s3.send(
        new PutBucketNotificationConfigurationCommand({
          Bucket: bucket,
          NotificationConfiguration: configuration,
        }),
      ),
  );
}

export function useMultipartUploads(bucket: string) {
  const { s3 } = useS3();
  return useBucketSetting(
    bucket,
    SETTINGS.multipartUploads,
    async () => (await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads ?? [],
  );
}

interface MultipartUploadReference {
  key: string;
  uploadId: string;
}

export function useAbortMultipartUploads(bucket: string) {
  const { s3 } = useS3();
  return useBucketSettingMutation(
    bucket,
    SETTINGS.multipartUploads,
    (uploads: MultipartUploadReference[]) =>
      Promise.all(
        uploads.map((upload) =>
          s3.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: upload.key,
              UploadId: upload.uploadId,
            }),
          ),
        ),
      ),
  );
}
