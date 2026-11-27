import {
  GetAuthorizersCommand,
  GetResourcesCommand,
  GetStagesCommand,
  type APIGatewayClient,
} from "@aws-sdk/client-api-gateway";
import {
  GetAuthorizersCommand as GetAuthorizersV2Command,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand as GetStagesV2Command,
  type ApiGatewayV2Client,
} from "@aws-sdk/client-apigatewayv2";
import { allPages } from "#shared/aws/pagination.ts";
import type { AuthorizerRow, StageRow } from "#services/apigateway/apis.ts";
import { IDENTITY_SEPARATOR } from "#services/apigateway/constants.ts";
import { API_VERSIONS } from "#services/apigateway/paths.ts";
import { joinRoutes } from "#services/apigateway/routeRows.ts";
import type { ApiRef } from "./apis.ts";

export const listResources = (v1: APIGatewayClient, apiId: string) =>
  allPages(async (position) => {
    const page = await v1.send(
      new GetResourcesCommand({ restApiId: apiId, embed: ["methods"], position }),
    );
    return { items: page.items ?? [], nextToken: page.position };
  });

export async function listAuthorizers(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
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

export async function listStages(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
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

export async function listRoutes(v2: ApiGatewayV2Client, apiId: string) {
  const [routes, integrations] = await Promise.all([
    allPages(async (NextToken) => {
      const page = await v2.send(new GetRoutesCommand({ ApiId: apiId, NextToken }));
      return { items: page.Items ?? [], nextToken: page.NextToken };
    }),
    allPages(async (NextToken) => {
      const page = await v2.send(new GetIntegrationsCommand({ ApiId: apiId, NextToken }));
      return { items: page.Items ?? [], nextToken: page.NextToken };
    }),
  ]);
  return joinRoutes(routes, integrations);
}
