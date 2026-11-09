import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { notifyError } from "@shared/hooks/useNotify.ts";
import { DOWNLOAD_URL_LIFETIME_SECONDS, type PresignMethod } from "./constants.ts";
import { fileNameOf } from "./helpers.ts";

interface PresignOptions {
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

// Tải qua pre-signed URL: trình duyệt lấy thẳng từ Floci,
// file lớn không bị nạp vào bộ nhớ. Lỗi được báo ở đây nên nơi gọi không cần catch.
export async function downloadObject(
  signer: S3Client,
  bucket: string,
  key: string,
  versionId?: string,
) {
  try {
    const url = await presign(signer, {
      bucket,
      key,
      versionId,
      method: "GET",
      expiresIn: DOWNLOAD_URL_LIFETIME_SECONDS,
      asAttachment: true,
    });
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    notifyError(error, `Couldn't download ${fileNameOf(key)}`);
  }
}
