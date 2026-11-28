import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignMethod } from "#services/s3/constants.ts";
import { fileNameOf } from "#services/s3/helpers.ts";

export interface PresignOptions {
  bucket: string;
  key: string;
  method: PresignMethod;
  expiresIn: number;
  versionId?: string;
  asAttachment?: boolean;
}

const attachmentDisposition = (key: string) =>
  `attachment; filename="${encodeURIComponent(fileNameOf(key))}"`;

export function presign(signer: S3Client, options: PresignOptions) {
  const { bucket, key, method, expiresIn, versionId, asAttachment } = options;
  const command =
    method === "GET"
      ? new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          VersionId: versionId,
          ResponseContentDisposition: asAttachment ? attachmentDisposition(key) : undefined,
        })
      : new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(signer, command, { expiresIn });
}
