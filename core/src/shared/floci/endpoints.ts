import { withQuery } from "#shared/utils/paths.ts";

// Endpoint riêng của Floci, AWS không có. Gom một chỗ: đổi sang emulator khác thì sửa ở đây
export const FLOCI_ENDPOINTS = {
  info: "/_floci/info",
  health: "/_floci/health",
  reset: "/_floci/state/reset",
  sesMailbox: "/_aws/ses",
  sqsMessages: "/_aws/sqs/messages",
  snsSms: "/_aws/sns",
} as const;

const TRAILING_SLASH = /\/$/;

// baseUrl: web là origin + /aws (proxy), server gọi thẳng Floci (AWS_ENDPOINT_URL)
export const flociUrl = (
  baseUrl: string,
  path: string,
  query: Record<string, string | undefined> = {},
) => withQuery(`${baseUrl.replace(TRAILING_SLASH, "")}${path}`, query);
