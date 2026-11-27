import {
  CopyObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectTaggingCommand,
  type DeleteMarkerEntry,
  type ObjectVersion,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { KeyValue } from "#shared/types/keyValue.ts";
import { copySource, fromS3TagSet, toS3TagSet } from "#services/s3/helpers.ts";

export type VersionEntry = (ObjectVersion | DeleteMarkerEntry) & {
  isDeleteMarker: boolean;
  Size?: number;
};

export interface ObjectTagsInput {
  key: string;
  tags: KeyValue[];
}

export interface MetadataInput {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
}

export interface VersionReference {
  key: string;
  versionId: string;
}

export const headObject = (s3: S3Client, bucket: string, key: string) =>
  s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

export async function getObjectText(s3: S3Client, bucket: string, key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body!.transformToString();
}

const newestFirst = (left: VersionEntry, right: VersionEntry) =>
  (right.LastModified?.getTime() ?? 0) - (left.LastModified?.getTime() ?? 0);

export async function getObjectHistory(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<VersionEntry[]> {
  const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }));
  const versions = (page.Versions ?? []).map((version) => ({ ...version, isDeleteMarker: false }));
  const markers = (page.DeleteMarkers ?? []).map((marker) => ({ ...marker, isDeleteMarker: true }));

  // Prefix khớp cả key dài hơn (notes.txt khớp notes.txt.bak)
  return [...versions, ...markers].filter((entry) => entry.Key === key).sort(newestFirst);
}

export const getObjectTags = async (s3: S3Client, bucket: string, key: string) =>
  fromS3TagSet((await s3.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }))).TagSet);

export const putObjectTags = (s3: S3Client, bucket: string, { key, tags }: ObjectTagsInput) =>
  s3.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: toS3TagSet(tags) },
    }),
  );

// S3 không sửa metadata tại chỗ: copy object lên chính nó với REPLACE
export const editMetadata = (
  s3: S3Client,
  bucket: string,
  { key, contentType, metadata }: MetadataInput,
) =>
  s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: copySource(bucket, key),
      MetadataDirective: "REPLACE",
      ContentType: contentType || undefined,
      Metadata: metadata,
    }),
  );

// Đưa version cũ thành bản mới nhất
export const restoreVersion = (
  s3: S3Client,
  bucket: string,
  { key, versionId }: VersionReference,
) =>
  s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: copySource(bucket, key, versionId),
    }),
  );
