import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeleteRestApiCommand } from "@aws-sdk/client-api-gateway";
import { DeleteApiCommand } from "@aws-sdk/client-apigatewayv2";
import { listApis } from "../apis.ts";
import { API_VERSIONS, type ApiVersion } from "../routes.ts";
import { useApiGateway } from "./useApiGateway.ts";

// Mọi query của API Gateway nằm dưới key gốc này
export const APIGATEWAY_QUERY_ROOT = "apigateway";
const apisQueryKey = [APIGATEWAY_QUERY_ROOT, "apis"];
const anyApiQueryKey = [APIGATEWAY_QUERY_ROOT, "api"];
export const apiQueryKey = (version: ApiVersion, apiId: string, part?: string) =>
  part ? [...anyApiQueryKey, version, apiId, part] : [...anyApiQueryKey, version, apiId];

export function useApis() {
  const { v1, v2 } = useApiGateway();
  return useQuery({ queryKey: apisQueryKey, queryFn: () => listApis(v1, v2) });
}

export function useDeleteApi() {
  const { v1, v2 } = useApiGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ version, apiId }: { version: ApiVersion; apiId: string }) =>
      version === API_VERSIONS.rest
        ? v1.send(new DeleteRestApiCommand({ restApiId: apiId }))
        : v2.send(new DeleteApiCommand({ ApiId: apiId })),
    // Chỉ làm mới danh sách: refetch chi tiết API đã xóa trả 404, trang thành not found và gỡ modal
    // trước khi kịp điều hướng (removeQueries cũng vậy: trang render lại là query được tạo và gọi lại)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apisQueryKey }),
  });
}
