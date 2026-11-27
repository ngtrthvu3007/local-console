import {
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetRestApiCommand,
  paginateGetRestApis,
  UpdateRestApiCommand,
  type APIGatewayClient,
} from "@aws-sdk/client-api-gateway";
import {
  CreateApiCommand,
  CreateStageCommand,
  DeleteApiCommand,
  GetApiCommand,
  GetApisCommand,
  UpdateApiCommand,
  type ApiGatewayV2Client,
} from "@aws-sdk/client-apigatewayv2";
import { allPages, collectPages } from "#shared/aws/pagination.ts";
import {
  API_FAMILIES,
  API_TYPES,
  apiTypeOf,
  type ApiDetail,
  type ApiListing,
  type ApiRow,
} from "#services/apigateway/apis.ts";
import { DEFAULT_KEY, HTTP_PROTOCOL, WEBSOCKET_PROTOCOL } from "#services/apigateway/constants.ts";
import { API_VERSIONS, type ApiVersion } from "#services/apigateway/paths.ts";
import type { ApiValues } from "#services/apigateway/schemas.ts";

export interface ApiRef {
  version: ApiVersion;
  apiId: string;
}

async function listRestApis(v1: APIGatewayClient): Promise<ApiRow[]> {
  const apis = await collectPages(paginateGetRestApis({ client: v1 }, {}), (page) => page.items);

  return apis.map((api) => ({
    id: api.id ?? "",
    name: api.name ?? "",
    version: API_VERSIONS.rest,
    type: API_TYPES.rest,
    created: api.createdDate,
  }));
}

async function listV2Apis(v2: ApiGatewayV2Client): Promise<ApiRow[]> {
  const apis = await allPages(async (NextToken) => {
    const page = await v2.send(new GetApisCommand({ NextToken }));
    return { items: page.Items ?? [], nextToken: page.NextToken };
  });
  return apis.map((api) => ({
    id: api.ApiId ?? "",
    name: api.Name ?? "",
    version: API_VERSIONS.v2,
    type: apiTypeOf(api.ProtocolType),
    created: api.CreatedDate,
  }));
}

export async function listApis(v1: APIGatewayClient, v2: ApiGatewayV2Client): Promise<ApiListing> {
  const results = await Promise.allSettled([listRestApis(v1), listV2Apis(v2)]);
  const rows = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const families = [API_FAMILIES.rest, API_FAMILIES.v2];
  const failures = results.flatMap((result, index) =>
    result.status === "rejected" ? [{ family: families[index], error: result.reason }] : [],
  );
  // Cả hai lỗi thì để query lỗi, trang hiện qua emptyOrError
  if (failures.length === results.length) throw failures[0].error;
  return { rows, failures };
}

export async function getApi(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
): Promise<ApiDetail> {
  if (version === API_VERSIONS.rest) {
    const api = await v1.send(new GetRestApiCommand({ restApiId: apiId }));
    return {
      name: api.name ?? "",
      description: api.description,
      type: API_TYPES.rest,
      created: api.createdDate,
    };
  }
  const api = await v2.send(new GetApiCommand({ ApiId: apiId }));
  return {
    name: api.Name ?? "",
    description: api.Description,
    type: apiTypeOf(api.ProtocolType),
    created: api.CreatedDate,
    routeSelection: api.RouteSelectionExpression,
  };
}

export const deleteApi = (
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
) =>
  version === API_VERSIONS.rest
    ? v1.send(new DeleteRestApiCommand({ restApiId: apiId }))
    : v2.send(new DeleteApiCommand({ ApiId: apiId }));

export async function createApi(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  values: ApiValues,
): Promise<ApiRef> {
  if (values.type === API_TYPES.rest) {
    const api = await v1.send(
      new CreateRestApiCommand({ name: values.name, description: values.description }),
    );
    return { version: API_VERSIONS.rest, apiId: api.id ?? "" };
  }

  const webSocket = values.type === API_TYPES.websocket;
  const { ApiId = "" } = await v2.send(
    new CreateApiCommand({
      Name: values.name,
      Description: values.description,
      ProtocolType: webSocket ? WEBSOCKET_PROTOCOL : HTTP_PROTOCOL,
      RouteSelectionExpression: webSocket ? values.routeSelection : undefined,
      // Tạo nhanh: Floci tạo route + integration + stage $default tự deploy (spec 7 #20)
      Target: !webSocket && values.functionArn ? values.functionArn : undefined,
    }),
  );
  // HTTP không chọn function: tự có stage $default để invoke URL chạy ngay khi thêm route
  if (values.type === API_TYPES.http && !values.functionArn) {
    await v2.send(new CreateStageCommand({ ApiId, StageName: DEFAULT_KEY, AutoDeploy: true }));
  }
  return { version: API_VERSIONS.v2, apiId: ApiId };
}

export type ApiSettings = Pick<ApiValues, "name" | "description" | "routeSelection">;

export async function updateApi(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
  values: ApiSettings,
) {
  if (version === API_VERSIONS.rest) {
    await v1.send(
      new UpdateRestApiCommand({
        restApiId: apiId,
        patchOperations: [
          { op: "replace", path: "/name", value: values.name },
          { op: "replace", path: "/description", value: values.description },
        ],
      }),
    );
    return;
  }
  // HTTP API không có route selection riêng: để trống thì giữ nguyên
  await v2.send(
    new UpdateApiCommand({
      ApiId: apiId,
      Name: values.name,
      Description: values.description,
      RouteSelectionExpression: values.routeSelection || undefined,
    }),
  );
}
