import {
  AbortMultipartUploadCommand,
  DeleteBucketCorsCommand,
  DeleteBucketLifecycleCommand,
  DeleteBucketPolicyCommand,
  DeleteBucketTaggingCommand,
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
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
  type S3Client,
} from "@aws-sdk/client-s3";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import type { KeyValue } from "#shared/types/keyValue.ts";
import {
  REGION_WITHOUT_LOCATION_CONSTRAINT,
  VERSIONING_STATUS,
  type VersioningStatus,
} from "#services/s3/constants.ts";
import { fromS3TagSet, toS3TagSet } from "#services/s3/helpers.ts";

export interface MultipartUploadReference {
  key: string;
  uploadId: string;
}

export const getBucketRegion = async (s3: S3Client, bucket: string) =>
  (await s3.send(new GetBucketLocationCommand({ Bucket: bucket }))).LocationConstraint ||
  REGION_WITHOUT_LOCATION_CONSTRAINT;

// Floci trả AES256 khi bucket chưa đặt mã hóa (không 404, spec KMS 7 #10)
export async function getBucketEncryption(s3: S3Client, bucket: string) {
  const { ServerSideEncryptionConfiguration } = await s3.send(
    new GetBucketEncryptionCommand({ Bucket: bucket }),
  );
  const rule = ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault;
  return { algorithm: rule?.SSEAlgorithm ?? "", keyId: rule?.KMSMasterKeyID ?? "" };
}

export const getVersioning = async (s3: S3Client, bucket: string): Promise<VersioningStatus> =>
  (await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }))).Status ??
  VERSIONING_STATUS.disabled;

export const setVersioning = (
  s3: S3Client,
  bucket: string,
  status: Exclude<VersioningStatus, "Disabled">,
) =>
  s3.send(
    new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: status } }),
  );

export const getBucketTags = (s3: S3Client, bucket: string) =>
  orEmptyWhenNotFound(
    async () =>
      fromS3TagSet((await s3.send(new GetBucketTaggingCommand({ Bucket: bucket }))).TagSet),
    [] as KeyValue[],
  );

export const saveBucketTags = (s3: S3Client, bucket: string, tags: readonly KeyValue[]) =>
  tags.length
    ? s3.send(
        new PutBucketTaggingCommand({ Bucket: bucket, Tagging: { TagSet: toS3TagSet(tags) } }),
      )
    : s3.send(new DeleteBucketTaggingCommand({ Bucket: bucket }));

export const getBucketPolicy = (s3: S3Client, bucket: string) =>
  orEmptyWhenNotFound(
    async () => (await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }))).Policy ?? null,
    null as string | null,
  );

// null = xóa policy
export const saveBucketPolicy = (s3: S3Client, bucket: string, policy: string | null) =>
  policy
    ? s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
    : s3.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));

export const getBucketCors = (s3: S3Client, bucket: string) =>
  orEmptyWhenNotFound(
    async () => (await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? null,
    null as CORSRule[] | null,
  );

// null hoặc mảng rỗng = xóa CORS
export const saveBucketCors = (s3: S3Client, bucket: string, rules: CORSRule[] | null) =>
  rules?.length
    ? s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }))
    : s3.send(new DeleteBucketCorsCommand({ Bucket: bucket }));

export const getLifecycleRules = (s3: S3Client, bucket: string) =>
  orEmptyWhenNotFound(
    async () =>
      (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules ?? [],
    [] as LifecycleRule[],
  );

// S3 không có API sửa từng rule: ghi lại toàn bộ, hết rule thì xóa cấu hình
export const saveLifecycleRules = (s3: S3Client, bucket: string, rules: LifecycleRule[]) =>
  rules.length
    ? s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: { Rules: rules },
        }),
      )
    : s3.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }));

export async function getBucketNotifications(
  s3: S3Client,
  bucket: string,
): Promise<NotificationConfiguration> {
  const { $metadata: _metadata, ...configuration } = await s3.send(
    new GetBucketNotificationConfigurationCommand({ Bucket: bucket }),
  );
  return configuration;
}

export const saveBucketNotifications = (
  s3: S3Client,
  bucket: string,
  configuration: NotificationConfiguration,
) =>
  s3.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucket,
      NotificationConfiguration: configuration,
    }),
  );

export const listMultipartUploads = async (s3: S3Client, bucket: string) =>
  (await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads ?? [];

export const abortMultipartUploads = (
  s3: S3Client,
  bucket: string,
  uploads: readonly MultipartUploadReference[],
) =>
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
  );
