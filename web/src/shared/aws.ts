import { useMemo } from "react";
import { AWS_PROXY_PATH, AWS_TEST_CREDENTIALS } from "./constants.ts";
import { useLoadedConfig } from "./hooks/useConfig.ts";

const HTTP_NOT_FOUND = 404;
// Lỗi "chưa cấu hình" của AWS: NoSuchTagSet, NoSuchBucketPolicy, NoSuchCORSConfiguration…
const NOT_CONFIGURED_ERROR_PREFIX = "NoSuch";
// CloudWatch Logs báo không tồn tại bằng mã 400 kèm tên lỗi này
const RESOURCE_NOT_FOUND_ERROR = "ResourceNotFoundException";

// SDK trong trình duyệt gọi Floci qua proxy của console
export const proxyEndpoint = () => `${window.location.origin}${AWS_PROXY_PATH}`;

interface AwsClientConfig {
  region: string;
  credentials: typeof AWS_TEST_CREDENTIALS;
  endpoint: string;
}

// Service truyền class SDK của nó vào, nên SDK vẫn chỉ tải cùng trang của service đó
export const awsClient = <T>(Client: new (config: AwsClientConfig) => T, region: string) =>
  new Client({ region, credentials: AWS_TEST_CREDENTIALS, endpoint: proxyEndpoint() });

export function useAwsClient<T>(Client: new (config: AwsClientConfig) => T): T {
  const { region } = useLoadedConfig();

  return useMemo(() => awsClient(Client, region), [Client, region]);
}

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

// false = resource không còn, lỗi khác vẫn ném. isMissing: service báo thiếu bằng mã khác (SQS trả 400)
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

// Gom mọi trang của một API phân trang kiểu NextToken (ListBuses, ListRules, ListSchedules…)
export async function allPages<T>(
  fetchPage: (nextToken?: string) => Promise<{ items: T[]; nextToken?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | undefined;

  do {
    const page = await fetchPage(nextToken);
    items.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);

  return items;
}

// Chia danh sách theo giới hạn số tên mỗi lần gọi của AWS (DeleteParameters, Describe* của ECS…)
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
}
