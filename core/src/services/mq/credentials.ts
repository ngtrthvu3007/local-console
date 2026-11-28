import { toBase64 } from "#shared/utils/encoding.ts";

const BASIC_PREFIX = "Basic ";

// Header Basic cần base64 của UTF-8; btoa chỉ nhận Latin-1 nên đổi qua byte trước
export function basicAuthorization(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `${BASIC_PREFIX}${toBase64(bytes)}`;
}
