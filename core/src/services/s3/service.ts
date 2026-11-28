import type {
  CORSRule,
  LifecycleRule,
  NotificationConfiguration,
  S3Client,
} from "@aws-sdk/client-s3";
import type { KeyValue } from "#shared/types/keyValue.ts";
import type { VersioningStatus } from "./constants.ts";
import {
  bucketHasObjects,
  bucketTotals,
  createBucket,
  deleteBucket,
  headBucket,
  listBuckets,
  type CreateBucketInput,
  type DeleteBucketInput,
} from "./operations/buckets.ts";
import {
  editMetadata,
  getObjectHistory,
  getObjectTags,
  getObjectText,
  headObject,
  putObjectTags,
  restoreVersion,
  type MetadataInput,
  type ObjectTagsInput,
  type VersionReference,
} from "./operations/objectDetails.ts";
import {
  createFolder,
  deleteAllVersions,
  deleteObjectRows,
  listObjectRows,
  listVersionRows,
  transferObjects,
  type ObjectListInput,
  type ObjectRow,
  type TransferInput,
  type VersionMarker,
} from "./operations/objects.ts";
import { presign, type PresignOptions } from "./operations/presign.ts";
import {
  abortMultipartUploads,
  getBucketCors,
  getBucketEncryption,
  getBucketNotifications,
  getBucketPolicy,
  getBucketRegion,
  getBucketTags,
  getLifecycleRules,
  getVersioning,
  listMultipartUploads,
  saveBucketCors,
  saveBucketNotifications,
  saveBucketPolicy,
  saveBucketTags,
  saveLifecycleRules,
  setVersioning,
  type MultipartUploadReference,
} from "./operations/settings.ts";

interface S3Deps {
  signer: S3Client; // ký URL theo FLOCI_PUBLIC_URL để trình duyệt / app gọi thẳng Floci
  region: string;
}

export function createS3Service(s3: S3Client, { signer, region }: S3Deps) {
  return {
    listBuckets: () => listBuckets(s3),
    headBucket: (bucket: string) => headBucket(s3, bucket),
    bucketHasObjects: (bucket: string) => bucketHasObjects(s3, bucket),
    createBucket: (input: CreateBucketInput) => createBucket(s3, region, input),
    emptyBucket: (bucket: string) => deleteAllVersions(s3, bucket),
    deleteBucket: (input: DeleteBucketInput) => deleteBucket(s3, input),
    bucketTotals: (bucket: string) => bucketTotals(s3, bucket),

    getBucketRegion: (bucket: string) => getBucketRegion(s3, bucket),
    getBucketEncryption: (bucket: string) => getBucketEncryption(s3, bucket),
    getVersioning: (bucket: string) => getVersioning(s3, bucket),
    setVersioning: (bucket: string, status: Exclude<VersioningStatus, "Disabled">) =>
      setVersioning(s3, bucket, status),
    getBucketTags: (bucket: string) => getBucketTags(s3, bucket),
    saveBucketTags: (bucket: string, tags: readonly KeyValue[]) => saveBucketTags(s3, bucket, tags),
    getBucketPolicy: (bucket: string) => getBucketPolicy(s3, bucket),
    saveBucketPolicy: (bucket: string, policy: string | null) =>
      saveBucketPolicy(s3, bucket, policy),
    getBucketCors: (bucket: string) => getBucketCors(s3, bucket),
    saveBucketCors: (bucket: string, rules: CORSRule[] | null) => saveBucketCors(s3, bucket, rules),
    getLifecycleRules: (bucket: string) => getLifecycleRules(s3, bucket),
    saveLifecycleRules: (bucket: string, rules: LifecycleRule[]) =>
      saveLifecycleRules(s3, bucket, rules),
    getBucketNotifications: (bucket: string) => getBucketNotifications(s3, bucket),
    saveBucketNotifications: (bucket: string, configuration: NotificationConfiguration) =>
      saveBucketNotifications(s3, bucket, configuration),
    listMultipartUploads: (bucket: string) => listMultipartUploads(s3, bucket),
    abortMultipartUploads: (bucket: string, uploads: readonly MultipartUploadReference[]) =>
      abortMultipartUploads(s3, bucket, uploads),

    listObjectRows: (input: ObjectListInput, token?: string) => listObjectRows(s3, input, token),
    listVersionRows: (input: ObjectListInput, marker?: VersionMarker) =>
      listVersionRows(s3, input, marker),
    createFolder: (bucket: string, key: string) => createFolder(s3, bucket, key),
    deleteObjectRows: (bucket: string, rows: readonly ObjectRow[]) =>
      deleteObjectRows(s3, bucket, rows),
    transferObjects: (bucket: string, input: TransferInput) => transferObjects(s3, bucket, input),

    headObject: (bucket: string, key: string) => headObject(s3, bucket, key),
    getObjectText: (bucket: string, key: string) => getObjectText(s3, bucket, key),
    getObjectHistory: (bucket: string, key: string) => getObjectHistory(s3, bucket, key),
    getObjectTags: (bucket: string, key: string) => getObjectTags(s3, bucket, key),
    putObjectTags: (bucket: string, input: ObjectTagsInput) => putObjectTags(s3, bucket, input),
    editMetadata: (bucket: string, input: MetadataInput) => editMetadata(s3, bucket, input),
    restoreVersion: (bucket: string, version: VersionReference) =>
      restoreVersion(s3, bucket, version),

    presign: (options: PresignOptions) => presign(signer, options),
  };
}

export type S3Service = ReturnType<typeof createS3Service>;
