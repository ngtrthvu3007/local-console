import { paginateGetRestApis, type APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { GetApisCommand, type ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { allPages } from "../../shared/aws.ts";
import { WEBSOCKET_PROTOCOL } from "./constants.ts";
import { API_VERSIONS, type ApiVersion } from "./routes.ts";

export const API_TYPES = { rest: "REST", http: "HTTP", websocket: "WebSocket" } as const;
export type ApiType = (typeof API_TYPES)[keyof typeof API_TYPES];

export interface ApiRow {
  id: string;
  name: string;
  version: ApiVersion;
  type: ApiType;
  created?: Date;
}

export const apiTypeOf = (protocol?: string): ApiType =>
  protocol === WEBSOCKET_PROTOCOL ? API_TYPES.websocket : API_TYPES.http;

async function listRestApis(v1: APIGatewayClient): Promise<ApiRow[]> {
  const rows: ApiRow[] = [];
  for await (const page of paginateGetRestApis({ client: v1 }, {}))
    for (const api of page.items ?? [])
      rows.push({
        id: api.id ?? "",
        name: api.name ?? "",
        version: API_VERSIONS.rest,
        type: API_TYPES.rest,
        created: api.createdDate,
      });
  return rows;
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

// Nhãn họ API để người đọc biết thiếu loại nào
export const API_FAMILIES = {
  rest: API_TYPES.rest,
  v2: `${API_TYPES.http} / ${API_TYPES.websocket}`,
};

export interface ApiFailure {
  family: string;
  error: unknown;
}

export interface ApiListing {
  rows: ApiRow[];
  failures: ApiFailure[]; // nửa không đọc được; nửa còn lại vẫn hiện
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
