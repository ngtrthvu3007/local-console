import { proxyEndpoint } from "@shared/aws.ts";

// Code.Location trỏ host nội bộ của Floci, trình duyệt không mở được; đi qua proxy để Floci nhận đúng host đã ký
export function codeDownloadUrl(location: string) {
  const url = new URL(location);
  return `${proxyEndpoint()}${url.pathname}${url.search}`;
}
