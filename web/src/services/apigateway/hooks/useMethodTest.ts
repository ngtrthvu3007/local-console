import { useMutation } from "@tanstack/react-query";
import { readTestResponse, type MethodTestResult } from "@localconsole/core/apigateway";

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
      // Body chuỗi thì trình duyệt tự đặt Content-Type text/plain, Floci bỏ qua template application/json.
      // Blob không type: không có Content-Type (trừ khi người dùng tự nhập), Floci coi là JSON như AWS
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : new Blob([body]),
      });
      return readTestResponse(response, startedAt);
    },
  });
}
