import { useMutation } from "@tanstack/react-query";
import { readTestResponse, type MethodTestResult } from "../methodTest.ts";

export interface MethodTestRequest {
  url: string;
  method: string;
  headers: [string, string][];
  body?: string;
}

// Đi qua proxy /aws của console như mọi call khác. Status 4xx / 5xx là kết quả của lần test,
// chỉ lỗi mạng mới làm mutation lỗi
export function useMethodTest() {
  return useMutation({
    mutationFn: async ({
      url,
      method,
      headers,
      body,
    }: MethodTestRequest): Promise<MethodTestResult> => {
      const startedAt = performance.now();
      const response = await fetch(url, { method, headers, body });
      return readTestResponse(response, startedAt);
    },
  });
}
