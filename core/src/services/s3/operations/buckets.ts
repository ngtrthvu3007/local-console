import {
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  PutBucketEncryptionCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  paginateListObjectsV2,
  type BucketLocationConstraint,
  type S3Client,
} from "@aws-sdk/client-s3";
import { collectPages } from "#shared/aws/pagination.ts";
import type { KeyValue } from "#shared/types/keyValue.ts";
import {
  REGION_WITHOUT_LOCATION_CONSTRAINT,
  SSE_KMS_ALGORITHM,
  VERSIONING_STATUS,
} from "#services/s3/constants.ts";
import { toS3TagSet } from "#services/s3/helpers.ts";
import { deleteAllVersions } from "./objects.ts";

export interface CreateBucketInput {
  name: string;
  versioning: boolean;
  tags: KeyValue[];
  kmsKeyId?: string; // có (kể cả "" = aws/s3) thì đặt mã hóa mặc định SSE-KMS
}

export interface DeleteBucketInput {
  bucket: string;
  emptyFirst: boolean;
}

export interface BucketTotals {
  objectCount: number;
  totalBytes: number;
}

export const listBuckets = async (s3: S3Client) =>
  (await s3.send(new ListBucketsCommand({}))).Buckets ?? [];

export const headBucket = (s3: S3Client, bucket: string) =>
  s3.send(new HeadBucketCommand({ Bucket: bucket }));

export async function bucketHasObjects(s3: S3Client, bucket: string) {
  const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, MaxKeys: 1 }));
  return Boolean(page.Versions?.length || page.DeleteMarkers?.length);
}

export async function createBucket(
  s3: S3Client,
  region: string,
  { name, versioning, tags, kmsKeyId }: CreateBucketInput,
) {
  await s3.send(
    new CreateBucketCommand({
      Bucket: name,
      CreateBucketConfiguration:
        region === REGION_WITHOUT_LOCATION_CONSTRAINT
          ? undefined
          : { LocationConstraint: region as BucketLocationConstraint },
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
  if (kmsKeyId !== undefined) {
    await s3.send(
      new PutBucketEncryptionCommand({
        Bucket: name,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: SSE_KMS_ALGORITHM,
                KMSMasterKeyID: kmsKeyId || undefined,
              },
            },
          ],
        },
      }),
    );
  }
}

export async function deleteBucket(s3: S3Client, { bucket, emptyFirst }: DeleteBucketInput) {
  if (emptyFirst) await deleteAllVersions(s3, bucket);
  await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
}

// Chỉ đếm bản hiện tại của object, giống "Calculate total size" của AWS
export async function bucketTotals(s3: S3Client, bucket: string): Promise<BucketTotals> {
  const objects = await collectPages(
    paginateListObjectsV2({ client: s3 }, { Bucket: bucket }),
    (page) => page.Contents,
  );

  return {
    objectCount: objects.length,
    totalBytes: objects.reduce((total, object) => total + (object.Size ?? 0), 0),
  };
}
