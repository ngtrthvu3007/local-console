import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiVersion } from "@localconsole/core/apigateway";
import { useApiGatewayService } from "./useApiGatewayService.ts";

// Mọi query của API Gateway nằm dưới key gốc này
export const APIGATEWAY_QUERY_ROOT = "apigateway";
const apisQueryKey = [APIGATEWAY_QUERY_ROOT, "apis"];
const anyApiQueryKey = [APIGATEWAY_QUERY_ROOT, "api"];
export const apiQueryKey = (version: ApiVersion, apiId: string, part?: string) =>
  part ? [...anyApiQueryKey, version, apiId, part] : [...anyApiQueryKey, version, apiId];

export function useApis() {
  const apigateway = useApiGatewayService();

  return useQuery({ queryKey: apisQueryKey, queryFn: apigateway.listApis });
}

export function useDeleteApi() {
  const apigateway = useApiGatewayService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: apigateway.deleteApi,
    // Chỉ làm mới danh sách: refetch chi tiết API đã xóa trả 404, trang thành not found và gỡ modal
    // trước khi kịp điều hướng (removeQueries cũng vậy: trang render lại là query được tạo và gọi lại)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apisQueryKey }),
  });
}
