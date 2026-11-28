import { BODYLESS_METHODS } from "./constants.ts";
import { reformatJson } from "#shared/utils/json.ts";

export interface MethodTestResult {
  status: number;
  latencyMs: number;
  body: string;
  headers: [string, string][];
}

export const sendsBody = (httpMethod: string) => !BODYLESS_METHODS.includes(httpMethod);

// Đọc hết body rồi mới tính thời gian để latency gồm cả lúc tải response.
// Body rỗng (vd: Lambda đã xóa, Floci trả không có nội dung) vẫn là chuỗi rỗng, không phải lỗi
export async function readTestResponse(
  response: Response,
  startedAt: number,
): Promise<MethodTestResult> {
  const text = await response.text();
  return {
    status: response.status,
    latencyMs: Math.round(performance.now() - startedAt),
    body: reformatJson(text),
    headers: [...response.headers],
  };
}
