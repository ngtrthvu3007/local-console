import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { errorMessage, FLOCI_START_COMMAND } from "@localconsole/core/shared";
import { MCP_MAX_TEXT_CHARS, MCP_PAGE_SIZE } from "./constants.ts";

export const FLOCI_DOWN_MESSAGE = `Floci isn't running. Start it from the folder with the console's docker-compose.yml: ${FLOCI_START_COMMAND}`;

const UNREACHABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

interface NetworkError {
  code?: string;
  cause?: NetworkError;
  errors?: NetworkError[];
}

// SDK trong Node báo code ở chính lỗi, fetch báo ở cause, localhost (IPv4 + IPv6) gom trong AggregateError
const isUnreachable = (error?: NetworkError): boolean =>
  Boolean(error) &&
  (UNREACHABLE_CODES.has(error?.code ?? "") ||
    isUnreachable(error?.cause) ||
    (error?.errors ?? []).some(isUnreachable));

const textResult = (text: string, isError = false): CallToolResult => ({
  content: [{ type: "text", text }],
  ...(isError && { isError }),
});

// Text là JSON cho client chưa đọc structuredContent; qua JSON để Date thành chuỗi giống hệt hai bên
export function ok(data: object, consoleUrl?: string): CallToolResult {
  const text = JSON.stringify({ ...data, ...(consoleUrl && { consoleUrl }) });

  return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) };
}

// Lỗi zod của form (kiểm trong handler), lỗi AWS / Floci qua errorMessage như flashbar của UI
export function fail(error: unknown): CallToolResult {
  if (error instanceof z.ZodError) return textResult(z.prettifyError(error), true);

  return textResult(
    isUnreachable(error as NetworkError) ? FLOCI_DOWN_MESSAGE : errorMessage(error),
    true,
  );
}

// Thao tác hàng loạt của core (runEach) không ném lỗi mà trả failures
export function bulkResult(
  result: { count: number; failures: string[] },
  consoleUrl: string,
): CallToolResult {
  return result.failures.length
    ? textResult(result.failures.join("\n"), true)
    : ok({ count: result.count }, consoleUrl);
}

export function truncateText(text: string, max = MCP_MAX_TEXT_CHARS) {
  return text.length > max
    ? { text: text.slice(0, max), truncated: true }
    : { text, truncated: false };
}

// nextToken là offset: core đọc hết danh sách (local ít dữ liệu), MCP chỉ cắt trang để agent nhẹ context
export function page<T>(items: readonly T[], limit = MCP_PAGE_SIZE, nextToken?: string) {
  const start = Number(nextToken ?? 0);
  const end = start + limit;

  return { items: items.slice(start, end), ...(end < items.length && { nextToken: String(end) }) };
}
