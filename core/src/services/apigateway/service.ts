import type { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import type { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import { addPermission } from "#services/lambda/operations/functions.ts";
import { API_TYPES, type ApiType, type AuthorizerRow } from "./apis.ts";
import { isLambdaAuthorizer, type Authorization } from "./authorizers.ts";
import { DEFAULT_KEY, GRANT_FAILED_PREFIX } from "./constants.ts";
import {
  executeApiSourceArn,
  permissionStatementId,
  type PermissionTarget,
} from "./lambdaPermissions.ts";
import { listAuthorizers, listResources, listRoutes, listStages } from "./operations/apiDetail.ts";
import {
  createApi,
  deleteApi,
  getApi,
  listApis,
  updateApi,
  type ApiRef,
  type ApiSettings,
} from "./operations/apis.ts";
import {
  createResource,
  deleteMethod,
  deleteResource,
  saveMethod,
} from "./operations/resources.ts";
import { createAuthorizer, deleteAuthorizer, updateAuthorizer } from "./operations/authorizers.ts";
import { createRoute, deleteRoute, updateRoute } from "./operations/routes.ts";
import { createStage, deleteStage } from "./operations/stages.ts";
import type { ApiValues, AuthorizerValues, MethodValues, RouteValues } from "./schemas.ts";

interface ApiGatewayDeps {
  v2: ApiGatewayV2Client; // HTTP / WebSocket API
  lambda: LambdaClient; // thêm quyền gọi function khi gắn Lambda
  region: string;
}

// v1: REST API
export function createApiGatewayService(
  v1: APIGatewayClient,
  { v2, lambda, region }: ApiGatewayDeps,
) {
  // Floci không kiểm quyền này nhưng Lambda › Triggers đọc policy để hiện API (spec mục 4).
  // Lỗi chỉ báo lại, thao tác chính vẫn xong
  async function grantInvoke(apiId: string, functionArn: string, target: PermissionTarget) {
    try {
      await addPermission(lambda, {
        functionArn,
        statementId: permissionStatementId(apiId, target),
        sourceArn: executeApiSourceArn(region, apiId, target),
      });
      return [];
    } catch (error) {
      return [`${GRANT_FAILED_PREFIX}${errorMessage(error)}`];
    }
  }

  const grantRoute = (apiId: string, values: RouteValues) =>
    values.integration === "lambda" && values.grant
      ? grantInvoke(apiId, values.functionArn, { kind: "route", routeKey: values.routeKey })
      : Promise.resolve([]);

  const grantAuthorizer = (apiId: string, authorizerId: string, values: AuthorizerValues) =>
    isLambdaAuthorizer(values.type) && values.grant
      ? grantInvoke(apiId, values.functionArn, { kind: "authorizer", authorizerId })
      : Promise.resolve([]);

  return {
    listApis: () => listApis(v1, v2),
    getApi: (api: ApiRef) => getApi(v1, v2, api),
    deleteApi: (api: ApiRef) => deleteApi(v1, v2, api),
    listResources: (apiId: string) => listResources(v1, apiId),
    listAuthorizers: (api: ApiRef) => listAuthorizers(v1, v2, api),
    listStages: (api: ApiRef) => listStages(v1, v2, api),
    listRoutes: (apiId: string) => listRoutes(v2, apiId),

    createApi: async (values: ApiValues) => {
      const api = await createApi(v1, v2, values);
      const quickCreate = values.type === API_TYPES.http && values.functionArn && values.grant;
      const failures = quickCreate
        ? await grantInvoke(api.apiId, values.functionArn, { kind: "route", routeKey: DEFAULT_KEY })
        : [];
      return { api, failures };
    },
    updateApi: (api: ApiRef, values: ApiSettings) => updateApi(v1, v2, api, values),
    createStage: (api: ApiRef, name: string, autoDeploy: boolean) =>
      createStage(v1, v2, api, name, autoDeploy),
    deleteStage: (api: ApiRef, name: string) => deleteStage(v1, v2, api, name),

    createResource: (apiId: string, parentId: string, pathPart: string) =>
      createResource(v1, apiId, parentId, pathPart),
    deleteResource: (apiId: string, resourceId: string) => deleteResource(v1, apiId, resourceId),
    saveMethod: async (
      apiId: string,
      resource: { id: string; path: string },
      values: MethodValues,
      authorization: Authorization,
      isNew: boolean,
    ) => {
      await saveMethod(v1, region, apiId, resource.id, values, authorization, isNew);
      const target: PermissionTarget = {
        kind: "method",
        method: values.httpMethod,
        path: resource.path,
      };
      const failures =
        values.integration === "lambda" && values.grant
          ? await grantInvoke(apiId, values.functionArn, target)
          : [];
      return { failures };
    },
    deleteMethod: (apiId: string, resourceId: string, httpMethod: string) =>
      deleteMethod(v1, apiId, resourceId, httpMethod),

    createRoute: async (
      apiId: string,
      apiType: ApiType,
      values: RouteValues,
      authorization: Authorization,
    ) => {
      await createRoute(v2, apiId, apiType, values, authorization);
      return { failures: await grantRoute(apiId, values) };
    },
    updateRoute: async (
      apiId: string,
      apiType: ApiType,
      routeId: string,
      values: RouteValues,
      authorization: Authorization,
    ) => {
      await updateRoute(v2, apiId, apiType, routeId, values, authorization);
      return { failures: await grantRoute(apiId, values) };
    },
    deleteRoute: (apiId: string, routeId: string) => deleteRoute(v2, apiId, routeId),

    createAuthorizer: async (api: ApiRef, apiType: ApiType, values: AuthorizerValues) => {
      const authorizerId = await createAuthorizer(v1, v2, region, api, apiType, values);
      return { authorizerId, failures: await grantAuthorizer(api.apiId, authorizerId, values) };
    },
    updateAuthorizer: async (
      api: ApiRef,
      apiType: ApiType,
      current: AuthorizerRow,
      values: AuthorizerValues,
    ) => {
      await updateAuthorizer(v1, v2, region, api, apiType, current, values);
      return { failures: await grantAuthorizer(api.apiId, current.id, values) };
    },
    deleteAuthorizer: (api: ApiRef, authorizerId: string) =>
      deleteAuthorizer(v1, v2, api, authorizerId),
  };
}

export type ApiGatewayService = ReturnType<typeof createApiGatewayService>;
