import { AWS_PROXY_PATH } from "./constants.ts";

const HTTP_NOT_FOUND = 404;
// Lỗi "chưa cấu hình" của AWS: NoSuchTagSet, NoSuchBucketPolicy, NoSuchCORSConfiguration…
const NOT_CONFIGURED_ERROR_PREFIX = "NoSuch";
// CloudWatch Logs báo không tồn tại bằng mã 400 kèm tên lỗi này
const RESOURCE_NOT_FOUND_ERROR = "ResourceNotFoundException";

// SDK trong trình duyệt gọi Floci qua proxy của console
export const proxyEndpoint = () => `${window.location.origin}${AWS_PROXY_PATH}`;

interface AwsError {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

export function isNotFoundError(error: unknown): boolean {
  const awsError = error as AwsError;
  return (
    awsError?.$metadata?.httpStatusCode === HTTP_NOT_FOUND ||
    awsError?.name === RESOURCE_NOT_FOUND_ERROR ||
    Boolean(awsError?.name?.startsWith(NOT_CONFIGURED_ERROR_PREFIX))
  );
}

// true nếu request chạy được, false nếu resource không còn; lỗi khác (mạng, 500) vẫn ném ra.
// `isMissing` cho dịch vụ có kiểu lỗi riêng (SQS trả 400, không phải 404)
export async function existsUnlessMissing(
  request: () => Promise<unknown>,
  isMissing: (error: unknown) => boolean = isNotFoundError,
): Promise<boolean> {
  try {
    await request();
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

// Cấu hình chưa từng đặt thì AWS trả lỗi, coi như rỗng
export async function orEmptyWhenNotFound<T>(request: () => Promise<T>, emptyValue: T): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isNotFoundError(error)) return emptyValue;
    throw error;
  }
}
