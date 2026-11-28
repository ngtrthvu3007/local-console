import { useQuery } from "@tanstack/react-query";
import { API_VERSIONS, type ApiVersion } from "@localconsole/core/apigateway";
import { apiQueryKey } from "./useApis.ts";
import { useApiGatewayService } from "./useApiGatewayService.ts";

export function useApi(version: ApiVersion, apiId: string) {
  const apigateway = useApiGatewayService();

  return useQuery({
    queryKey: apiQueryKey(version, apiId),
    queryFn: () => apigateway.getApi({ version, apiId }),
    retry: false,
  });
}

export function useResources(apiId: string) {
  const apigateway = useApiGatewayService();

  return useQuery({
    queryKey: apiQueryKey(API_VERSIONS.rest, apiId, "resources"),
    queryFn: () => apigateway.listResources(apiId),
  });
}

export function useAuthorizers(version: ApiVersion, apiId: string) {
  const apigateway = useApiGatewayService();

  return useQuery({
    queryKey: apiQueryKey(version, apiId, "authorizers"),
    queryFn: () => apigateway.listAuthorizers({ version, apiId }),
  });
}

export function useStages(version: ApiVersion, apiId: string) {
  const apigateway = useApiGatewayService();

  return useQuery({
    queryKey: apiQueryKey(version, apiId, "stages"),
    queryFn: () => apigateway.listStages({ version, apiId }),
  });
}

export function useRoutes(apiId: string) {
  const apigateway = useApiGatewayService();

  return useQuery({
    queryKey: apiQueryKey(API_VERSIONS.v2, apiId, "routes"),
    queryFn: () => apigateway.listRoutes(apiId),
  });
}
