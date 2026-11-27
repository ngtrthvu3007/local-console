import { useQuery } from "@tanstack/react-query";
import {
  GetAuthorizersCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  GetStagesCommand,
} from "@aws-sdk/client-api-gateway";
import {
  GetApiCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetAuthorizersCommand as GetAuthorizersV2Command,
  GetStagesCommand as GetStagesV2Command,
} from "@aws-sdk/client-apigatewayv2";
import { joinRoutes } from "../routeRows.ts";
import { allPages } from "@shared/aws.ts";
import { API_TYPES, apiTypeOf, type ApiType } from "../apis.ts";
import { IDENTITY_SEPARATOR } from "../constants.ts";
import { API_VERSIONS, type ApiVersion } from "../routes.ts";
import { apiQueryKey } from "./useApis.ts";
import { useApiGateway, type ApiGatewayClients } from "./useApiGateway.ts";

export interface ApiDetail {
  name: string;
  type: ApiType;
  created?: Date;
  routeSelection?: string;
}

export interface AuthorizerRow {
  id: string;
  name: string;
  type: string;
  identitySource: string;
  target?: string;
  providerArns?: string[];
  issuer?: string;
}

export interface StageRow {
  name: string;
  deploymentId?: string;
  updated?: Date;
}

export function useApi(version: ApiVersion, apiId: string) {
  const { v1, v2 } = useApiGateway();
  return useQuery({
    queryKey: apiQueryKey(version, apiId),
    queryFn: async (): Promise<ApiDetail> => {
      if (version === API_VERSIONS.rest) {
        const api = await v1.send(new GetRestApiCommand({ restApiId: apiId }));
        return { name: api.name ?? "", type: API_TYPES.rest, created: api.createdDate };
      }
      const api = await v2.send(new GetApiCommand({ ApiId: apiId }));
      return {
        name: api.Name ?? "",
        type: apiTypeOf(api.ProtocolType),
        created: api.CreatedDate,
        routeSelection: api.RouteSelectionExpression,
      };
    },
    retry: false,
  });
}

export function useResources(apiId: string) {
  const { v1 } = useApiGateway();
  return useQuery({
    queryKey: apiQueryKey(API_VERSIONS.rest, apiId, "resources"),
    queryFn: () =>
      allPages(async (position) => {
        const page = await v1.send(
          new GetResourcesCommand({ restApiId: apiId, embed: ["methods"], position }),
        );
        return { items: page.items ?? [], nextToken: page.position };
      }),
  });
}

export async function listAuthorizers(
  { v1, v2 }: ApiGatewayClients,
  version: ApiVersion,
  apiId: string,
): Promise<AuthorizerRow[]> {
  if (version === API_VERSIONS.rest) {
    const items = await allPages(async (position) => {
      const page = await v1.send(new GetAuthorizersCommand({ restApiId: apiId, position }));
      return { items: page.items ?? [], nextToken: page.position };
    });
    return items.map((a) => ({
      id: a.id ?? "",
      name: a.name ?? "",
      type: a.type ?? "",
      identitySource: a.identitySource ?? "",
      target: a.authorizerUri,
      providerArns: a.providerARNs,
    }));
  }
  const items = await allPages(async (NextToken) => {
    const page = await v2.send(new GetAuthorizersV2Command({ ApiId: apiId, NextToken }));
    return { items: page.Items ?? [], nextToken: page.NextToken };
  });
  return items.map((a) => ({
    id: a.AuthorizerId ?? "",
    name: a.Name ?? "",
    type: a.AuthorizerType ?? "",
    identitySource: a.IdentitySource?.join(IDENTITY_SEPARATOR) ?? "",
    target: a.AuthorizerUri,
    issuer: a.JwtConfiguration?.Issuer,
  }));
}

export function useAuthorizers(version: ApiVersion, apiId: string) {
  const clients = useApiGateway();
  return useQuery({
    queryKey: apiQueryKey(version, apiId, "authorizers"),
    queryFn: () => listAuthorizers(clients, version, apiId),
  });
}

export async function listStages(
  { v1, v2 }: ApiGatewayClients,
  version: ApiVersion,
  apiId: string,
): Promise<StageRow[]> {
  // v1 GetStages không phân trang; v2 có NextToken
  if (version === API_VERSIONS.rest) {
    const { item = [] } = await v1.send(new GetStagesCommand({ restApiId: apiId }));
    return item.map((s) => ({
      name: s.stageName ?? "",
      deploymentId: s.deploymentId,
      updated: s.lastUpdatedDate,
    }));
  }
  const items = await allPages(async (NextToken) => {
    const page = await v2.send(new GetStagesV2Command({ ApiId: apiId, NextToken }));
    return { items: page.Items ?? [], nextToken: page.NextToken };
  });
  return items.map((s) => ({
    name: s.StageName ?? "",
    deploymentId: s.DeploymentId,
    updated: s.LastUpdatedDate,
  }));
}

export function useStages(version: ApiVersion, apiId: string) {
  const clients = useApiGateway();
  return useQuery({
    queryKey: apiQueryKey(version, apiId, "stages"),
    queryFn: () => listStages(clients, version, apiId),
  });
}

export function useRoutes(apiId: string) {
  const { v2 } = useApiGateway();
  return useQuery({
    queryKey: apiQueryKey(API_VERSIONS.v2, apiId, "routes"),
    queryFn: async () => {
      const routes = await allPages(async (NextToken) => {
        const page = await v2.send(new GetRoutesCommand({ ApiId: apiId, NextToken }));
        return { items: page.Items ?? [], nextToken: page.NextToken };
      });
      const integrations = await allPages(async (NextToken) => {
        const page = await v2.send(new GetIntegrationsCommand({ ApiId: apiId, NextToken }));
        return { items: page.Items ?? [], nextToken: page.NextToken };
      });
      return joinRoutes(routes, integrations);
    },
  });
}
