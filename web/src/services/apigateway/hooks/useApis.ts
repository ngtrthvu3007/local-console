import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ApiSettings, ApiVersion } from "@localconsole/core/apigateway";
import { LAMBDA_QUERY_ROOT } from "../../lambda/hooks/useFunctions.ts";
import { useApiGatewayService } from "./useApiGatewayService.ts";

// Mọi query của API Gateway nằm dưới key gốc này
export const APIGATEWAY_QUERY_ROOT = "apigateway";
const apisQueryKey = [APIGATEWAY_QUERY_ROOT, "apis"];
const anyApiQueryKey = [APIGATEWAY_QUERY_ROOT, "api"];
export const apiQueryKey = (version: ApiVersion, apiId: string, part?: string) =>
  part ? [...anyApiQueryKey, version, apiId, part] : [...anyApiQueryKey, version, apiId];

// Thao tác có thể thêm quyền gọi Lambda: làm mới cả Lambda (tab Triggers đọc policy)
export function useRefreshWithLambda() {
  const queryClient = useQueryClient();

  return (...keys: QueryKey[]) =>
    Promise.all(
      [...keys, [LAMBDA_QUERY_ROOT]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useApis() {
  const apigateway = useApiGatewayService();

  return useQuery({ queryKey: apisQueryKey, queryFn: apigateway.listApis });
}

export function useCreateApi() {
  const apigateway = useApiGatewayService();
  const refresh = useRefreshWithLambda();

  return useMutation({
    mutationFn: apigateway.createApi,
    onSuccess: () => refresh(apisQueryKey),
  });
}

export function useUpdateApi(version: ApiVersion, apiId: string) {
  const apigateway = useApiGatewayService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ApiSettings) => apigateway.updateApi({ version, apiId }, values),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apisQueryKey }),
        queryClient.invalidateQueries({ queryKey: apiQueryKey(version, apiId) }),
      ]),
  });
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
