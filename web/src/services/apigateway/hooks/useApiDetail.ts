import { useMutation, useQuery } from "@tanstack/react-query";
import {
  API_VERSIONS,
  type ApiGatewayService,
  type ApiRef,
  type ApiVersion,
  type ApiType,
  type Authorization,
  type AuthorizerRow,
  type AuthorizerValues,
  type MethodValues,
  type RouteValues,
} from "@localconsole/core/apigateway";
import { apiQueryKey, useRefreshWithLambda } from "./useApis.ts";
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

// Thao tác trong một API: xong thì làm mới mọi query của API đó, và Lambda (có thể vừa thêm quyền)
function useApiMutation<TVariables, TResult>(
  version: ApiVersion,
  apiId: string,
  run: (apigateway: ApiGatewayService, api: ApiRef) => (variables: TVariables) => Promise<TResult>,
) {
  const apigateway = useApiGatewayService();
  const refresh = useRefreshWithLambda();

  return useMutation({
    mutationFn: run(apigateway, { version, apiId }),
    onSuccess: () => refresh(apiQueryKey(version, apiId)),
  });
}

export const useCreateStage = (version: ApiVersion, apiId: string) =>
  useApiMutation(
    version,
    apiId,
    (apigateway, api) =>
      ({ name, autoDeploy }: { name: string; autoDeploy: boolean }) =>
        apigateway.createStage(api, name, autoDeploy),
  );

export const useDeleteStage = (version: ApiVersion, apiId: string) =>
  useApiMutation(
    version,
    apiId,
    (apigateway, api) => (name: string) => apigateway.deleteStage(api, name),
  );

export const useCreateResource = (apiId: string) =>
  useApiMutation(
    API_VERSIONS.rest,
    apiId,
    (apigateway) =>
      ({ parentId, pathPart }: { parentId: string; pathPart: string }) =>
        apigateway.createResource(apiId, parentId, pathPart),
  );

export const useDeleteResource = (apiId: string) =>
  useApiMutation(
    API_VERSIONS.rest,
    apiId,
    (apigateway) => (resourceId: string) => apigateway.deleteResource(apiId, resourceId),
  );

interface SaveMethodInput {
  resource: { id: string; path: string };
  values: MethodValues;
  authorization: Authorization;
  isNew: boolean;
}

export const useSaveMethod = (apiId: string) =>
  useApiMutation(
    API_VERSIONS.rest,
    apiId,
    (apigateway) =>
      ({ resource, values, authorization, isNew }: SaveMethodInput) =>
        apigateway.saveMethod(apiId, resource, values, authorization, isNew),
  );

export const useDeleteMethod = (apiId: string) =>
  useApiMutation(
    API_VERSIONS.rest,
    apiId,
    (apigateway) =>
      ({ resourceId, httpMethod }: { resourceId: string; httpMethod: string }) =>
        apigateway.deleteMethod(apiId, resourceId, httpMethod),
  );

interface SaveRouteInput {
  routeId?: string; // có thì là sửa
  values: RouteValues;
  authorization: Authorization;
}

export const useSaveRoute = (apiId: string, apiType: ApiType) =>
  useApiMutation(
    API_VERSIONS.v2,
    apiId,
    (apigateway) =>
      ({ routeId, values, authorization }: SaveRouteInput) =>
        routeId
          ? apigateway.updateRoute(apiId, apiType, routeId, values, authorization)
          : apigateway.createRoute(apiId, apiType, values, authorization),
  );

export const useDeleteRoute = (apiId: string) =>
  useApiMutation(
    API_VERSIONS.v2,
    apiId,
    (apigateway) => (routeId: string) => apigateway.deleteRoute(apiId, routeId),
  );

interface SaveAuthorizerInput {
  current?: AuthorizerRow; // có thì là sửa
  values: AuthorizerValues;
}

export const useSaveAuthorizer = (version: ApiVersion, apiId: string, apiType: ApiType) =>
  useApiMutation(
    version,
    apiId,
    (apigateway, api) =>
      ({ current, values }: SaveAuthorizerInput) =>
        current
          ? apigateway.updateAuthorizer(api, apiType, current, values)
          : apigateway.createAuthorizer(api, apiType, values),
  );

export const useDeleteAuthorizer = (version: ApiVersion, apiId: string) =>
  useApiMutation(
    version,
    apiId,
    (apigateway, api) => (authorizerId: string) => apigateway.deleteAuthorizer(api, authorizerId),
  );
