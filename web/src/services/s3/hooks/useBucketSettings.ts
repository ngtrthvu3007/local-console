import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CORSRule, LifecycleRule, NotificationConfiguration } from "@aws-sdk/client-s3";
import {
  VERSIONING_STATUS,
  type MultipartUploadReference,
  type VersioningStatus,
} from "@localconsole/core/s3";
import type { KeyValue } from "@localconsole/core/shared";
import { bucketQueryKey } from "./useBuckets.ts";
import { useS3Service } from "./useS3Service.ts";

const SETTINGS = {
  region: "region",
  encryption: "encryption",
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
  const s3 = useS3Service();

  return useQuery({
    queryKey: bucketQueryKey(bucket, SETTINGS.totalSize),
    queryFn: () => s3.bucketTotals(bucket),
    enabled: false,
  });
}

export function useBucketRegion(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.region, () => s3.getBucketRegion(bucket));
}

export function useBucketEncryption(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.encryption, () => s3.getBucketEncryption(bucket));
}

export function useVersioning(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.versioning, () => s3.getVersioning(bucket));
}

// Chưa tải xong thì coi như chưa bật
export function useIsVersioned(bucket: string) {
  const status = useVersioning(bucket).data ?? VERSIONING_STATUS.disabled;
  return status !== VERSIONING_STATUS.disabled;
}

export function useSetVersioning(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(
    bucket,
    SETTINGS.versioning,
    (status: Exclude<VersioningStatus, "Disabled">) => s3.setVersioning(bucket, status),
  );
}

export function useBucketTags(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.tags, () => s3.getBucketTags(bucket));
}

export function useSaveBucketTags(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(bucket, SETTINGS.tags, (tags: KeyValue[]) =>
    s3.saveBucketTags(bucket, tags),
  );
}

export function useBucketPolicy(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.policy, () => s3.getBucketPolicy(bucket));
}

export function useSaveBucketPolicy(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(bucket, SETTINGS.policy, (policy: string | null) =>
    s3.saveBucketPolicy(bucket, policy),
  );
}

export function useBucketCors(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.cors, () => s3.getBucketCors(bucket));
}

export function useSaveBucketCors(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(bucket, SETTINGS.cors, (rules: CORSRule[] | null) =>
    s3.saveBucketCors(bucket, rules),
  );
}

export function useLifecycleRules(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.lifecycle, () => s3.getLifecycleRules(bucket));
}

export function useSaveLifecycleRules(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(bucket, SETTINGS.lifecycle, (rules: LifecycleRule[]) =>
    s3.saveLifecycleRules(bucket, rules),
  );
}

export function useBucketNotifications(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.notifications, () => s3.getBucketNotifications(bucket));
}

export function useSaveBucketNotifications(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(
    bucket,
    SETTINGS.notifications,
    (configuration: NotificationConfiguration) => s3.saveBucketNotifications(bucket, configuration),
  );
}

export function useMultipartUploads(bucket: string) {
  const s3 = useS3Service();

  return useBucketSetting(bucket, SETTINGS.multipartUploads, () => s3.listMultipartUploads(bucket));
}

export function useAbortMultipartUploads(bucket: string) {
  const s3 = useS3Service();

  return useBucketSettingMutation(
    bucket,
    SETTINGS.multipartUploads,
    (uploads: MultipartUploadReference[]) => s3.abortMultipartUploads(bucket, uploads),
  );
}
