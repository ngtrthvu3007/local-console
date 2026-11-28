import type { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import type { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { listAuthorizers, listResources, listRoutes, listStages } from "./operations/apiDetail.ts";
import { deleteApi, getApi, listApis, type ApiRef } from "./operations/apis.ts";

interface ApiGatewayDeps {
  v2: ApiGatewayV2Client; // HTTP / WebSocket API
}

// v1: REST API
export function createApiGatewayService(v1: APIGatewayClient, { v2 }: ApiGatewayDeps) {
  return {
    listApis: () => listApis(v1, v2),
    getApi: (api: ApiRef) => getApi(v1, v2, api),
    deleteApi: (api: ApiRef) => deleteApi(v1, v2, api),
    listResources: (apiId: string) => listResources(v1, apiId),
    listAuthorizers: (api: ApiRef) => listAuthorizers(v1, v2, api),
    listStages: (api: ApiRef) => listStages(v1, v2, api),
    listRoutes: (apiId: string) => listRoutes(v2, apiId),
  };
}

export type ApiGatewayService = ReturnType<typeof createApiGatewayService>;
