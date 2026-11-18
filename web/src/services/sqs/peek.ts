import type { Message } from "@aws-sdk/client-sqs";
import { fetchJson } from "@shared/api.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { PEEK_PATH, PEEK_QUEUE_URL_PARAM, SIGNING_SERVICE } from "./constants.ts";

const ISO_DATE_LENGTH = 10; // "2026-11-17"
const DATE_SEPARATOR = /-/g;
// Floci không kiểm chữ ký, chỉ đọc region trong Credential
const UNCHECKED_SIGNATURE = "unsigned";

// Không có header này Floci tìm queue ở region mặc định của nó → QueueDoesNotExist
export function peekAuthorization(region: string, now = new Date()) {
  const day = now.toISOString().slice(0, ISO_DATE_LENGTH).replace(DATE_SEPARATOR, "");
  const scope = `${AWS_TEST_CREDENTIALS.accessKeyId}/${day}/${region}/${SIGNING_SERVICE}/aws4_request`;
  return `AWS4-HMAC-SHA256 Credential=${scope}, SignedHeaders=host, Signature=${UNCHECKED_SIGNATURE}`;
}

export const peekUrl = (queueUrl: string) =>
  `${PEEK_PATH}?${new URLSearchParams({ [PEEK_QUEUE_URL_PARAM]: queueUrl })}`;

// Thấy cả message đang in flight; không đổi visibility, không tăng số lần nhận
export async function peekMessages(queueUrl: string, region: string): Promise<Message[]> {
  const result = await fetchJson<{ messages?: Message[] }>(peekUrl(queueUrl), {
    headers: { Authorization: peekAuthorization(region) },
  });
  return result.messages ?? [];
}
