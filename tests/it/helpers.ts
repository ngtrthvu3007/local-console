import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

// Console đang chạy; đổi cổng bằng LOCAL_CONSOLE_URL
export const CONSOLE_URL = process.env.LOCAL_CONSOLE_URL ?? "http://localhost:3701";
export const AWS_PROXY_URL = `${CONSOLE_URL}/aws`;

// Floci nhận credential bất kỳ, giống AWS_TEST_CREDENTIALS của console
export const TEST_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
export const ACCOUNT_ID = "000000000000";

// Hộp thư SES của Floci: endpoint riêng, không có trong SDK
const MAILBOX_URL = `${AWS_PROXY_URL}/_aws/ses`;

export interface Mail {
  Id: string;
  Source?: string;
  Region?: string;
  Subject?: string;
  Destination?: { ToAddresses?: string[] };
}

export const mailbox = async (): Promise<Mail[]> =>
  (await (await fetch(MAILBOX_URL)).json()).messages ?? [];

export const deleteMail = (id: string) =>
  fetch(`${MAILBOX_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE" });

// Chỉ xóa theo id, và chỉ mail của test gọi
export async function deleteMails(match: (mail: Mail) => boolean) {
  for (const mail of (await mailbox()).filter(match)) await deleteMail(mail.Id);
}

// Mọi resource test tạo ra đều có tiền tố này để dọn và không đụng dữ liệu khác
export const uniqueName = (kind: string) =>
  `lc-it-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface ConsoleConfig {
  region: string;
  flociPublicUrl: string;
  flociInternalUrl: string;
}

export async function consoleConfig(): Promise<ConsoleConfig> {
  return (await fetch(`${CONSOLE_URL}/api/config`)).json() as Promise<ConsoleConfig>;
}

// Client SDK đi qua proxy /aws của console, đúng đường trình duyệt dùng
export const viaConsole = (region: string) => ({
  region,
  endpoint: AWS_PROXY_URL,
  credentials: TEST_CREDENTIALS,
});

// Chờ tới khi check trả giá trị khác undefined, hoặc hết giờ
export async function waitFor<T>(
  description: string,
  check: () => Promise<T | undefined>,
  { timeoutMs = 120_000, intervalMs = 1_000 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== undefined) return result;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
}

// Gọi API AWS không có SDK cài sẵn (ElastiCache, MQ): ký SigV4 rồi gửi qua proxy của console
export async function signedAwsCall(
  region: string,
  service: string,
  request: { method: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const url = new URL(`${AWS_PROXY_URL}${request.path}`);

  const signer = new SignatureV4({
    service,
    region,
    credentials: TEST_CREDENTIALS,
    sha256: Sha256,
  });

  const signed = await signer.sign({
    method: request.method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: Number(url.port),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: { host: url.host, ...request.headers },
    body: request.body,
  });

  return fetch(url, { method: request.method, headers: signed.headers, body: request.body });
}

// ElastiCache dùng giao thức Query: form-urlencoded, trả XML
export async function elastiCache(region: string, action: string, params: Record<string, string>) {
  const body = new URLSearchParams({ Action: action, Version: "2015-02-02", ...params }).toString();

  const response = await signedAwsCall(region, "elasticache", {
    method: "POST",
    path: "/",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  return { status: response.status, text: await response.text() };
}

// Amazon MQ dùng REST JSON
export async function amazonMq(region: string, method: string, path: string, payload?: unknown) {
  const response = await signedAwsCall(region, "mq", {
    method,
    path,
    headers: { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

// Gọi API riêng của console (/api/...) và đọc JSON
export async function consoleApi(
  method: string,
  path: string,
  { body, headers }: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await fetch(`${CONSOLE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
