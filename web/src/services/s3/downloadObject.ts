import { DOWNLOAD_URL_LIFETIME_SECONDS, fileNameOf, type S3Service } from "@localconsole/core/s3";
import { notifyError } from "@shared/hooks/useNotify.ts";

// Tải qua pre-signed URL: trình duyệt lấy thẳng từ Floci,
// file lớn không bị nạp vào bộ nhớ. Lỗi được báo ở đây nên nơi gọi không cần catch.
export async function downloadObject(
  s3: S3Service,
  bucket: string,
  key: string,
  versionId?: string,
) {
  try {
    const url = await s3.presign({
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
