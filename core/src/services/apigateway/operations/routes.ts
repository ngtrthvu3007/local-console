import {
  AuthorizationType,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateRouteResponseCommand,
  DeleteIntegrationCommand,
  DeleteRouteCommand,
  GetIntegrationCommand,
  GetRouteCommand,
  UpdateIntegrationCommand,
  UpdateRouteCommand,
  type ApiGatewayV2Client,
} from "@aws-sdk/client-apigatewayv2";
import { API_TYPES, type ApiType } from "#services/apigateway/apis.ts";
import type { Authorization } from "#services/apigateway/authorizers.ts";
import {
  ANY_METHOD,
  DEFAULT_KEY,
  INTEGRATION_TYPES,
  PAYLOAD_FORMAT_VERSIONS,
} from "#services/apigateway/constants.ts";
import { functionArnOfUri } from "#services/apigateway/integration.ts";
import { integrationIdOf, integrationTarget } from "#services/apigateway/routeRows.ts";
import type { RouteValues } from "#services/apigateway/schemas.ts";
import { getRoutes } from "./apiDetail.ts";

// Authorization chung REST / v2 là chuỗi; v2 chỉ nhận các loại của nó
const ROUTE_AUTHORIZATION_TYPES: readonly AuthorizationType[] = Object.values(AuthorizationType);
const routeAuthorization = ({ authorizationType, authorizerId }: Authorization) => ({
  AuthorizationType: ROUTE_AUTHORIZATION_TYPES.find((type) => type === authorizationType),
  AuthorizerId: authorizerId,
});

type Target = Pick<RouteValues, "integration" | "functionArn" | "url">;

// HTTP proxy dùng payload 1.0, Lambda của HTTP API 2.0; WebSocket chỉ có một dạng
function integrationOf(apiType: ApiType, values: Target) {
  if (values.integration === "http") {
    return {
      IntegrationType: INTEGRATION_TYPES.httpProxy,
      IntegrationUri: values.url,
      IntegrationMethod: ANY_METHOD,
      PayloadFormatVersion: PAYLOAD_FORMAT_VERSIONS.v1,
    };
  }
  return {
    IntegrationType: INTEGRATION_TYPES.awsProxy,
    IntegrationUri: values.functionArn,
    PayloadFormatVersion: apiType === API_TYPES.http ? PAYLOAD_FORMAT_VERSIONS.v2 : undefined,
  };
}

async function createIntegration(
  v2: ApiGatewayV2Client,
  apiId: string,
  apiType: ApiType,
  values: Target,
) {
  const { IntegrationId = "" } = await v2.send(
    new CreateIntegrationCommand({ ApiId: apiId, ...integrationOf(apiType, values) }),
  );
  return IntegrationId;
}

// Floci 2.4.0 chỉ trả kết quả function cho client WebSocket khi route có cả
// RouteResponseSelectionExpression lẫn route response $default (development.md › Traps).
// Bật rồi thì không tắt được: xóa cả hai Floci vẫn trả lời, nên console chỉ bật
const isTwoWay = (apiType: ApiType, values: RouteValues) =>
  apiType === API_TYPES.websocket && values.twoWay;

const addRouteResponse = (v2: ApiGatewayV2Client, apiId: string, routeId: string) =>
  v2.send(
    new CreateRouteResponseCommand({
      ApiId: apiId,
      RouteId: routeId,
      RouteResponseKey: DEFAULT_KEY,
    }),
  );

export async function createRoute(
  v2: ApiGatewayV2Client,
  apiId: string,
  apiType: ApiType,
  values: RouteValues,
  authorization: Authorization,
) {
  const integrationId = await createIntegration(v2, apiId, apiType, values);
  const twoWay = isTwoWay(apiType, values);
  const route = await v2
    .send(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: values.routeKey,
        Target: integrationTarget(integrationId),
        ...routeAuthorization(authorization),
        RouteResponseSelectionExpression: twoWay ? DEFAULT_KEY : undefined,
      }),
    )
    .catch(async (error: unknown) => {
      // Không có route thì integration vừa tạo thành rác không thấy được (spec mục 9); lỗi gốc vẫn báo
      await v2
        .send(new DeleteIntegrationCommand({ ApiId: apiId, IntegrationId: integrationId }))
        .catch(() => {});
      throw error;
    });
  if (twoWay) await addRouteResponse(v2, apiId, route.RouteId ?? "");
}

// Đích mới cho route: integration chỉ route này dùng thì sửa tại chỗ, dùng chung thì tạo cái mới
async function retarget(
  v2: ApiGatewayV2Client,
  apiId: string,
  apiType: ApiType,
  routeId: string,
  currentTarget: string | undefined,
  values: Target,
) {
  const integrationId = integrationIdOf(currentTarget);
  if (!integrationId) return integrationTarget(await createIntegration(v2, apiId, apiType, values));

  const [current, routes] = await Promise.all([
    v2.send(new GetIntegrationCommand({ ApiId: apiId, IntegrationId: integrationId })),
    getRoutes(v2, apiId),
  ]);
  const wanted = integrationOf(apiType, values);
  const sameType = current.IntegrationType === wanted.IntegrationType;
  // IaC hay trỏ Lambda bằng URI invocation; cùng function thì coi như không đổi
  const currentUri = functionArnOfUri(current.IntegrationUri) ?? current.IntegrationUri;
  if (sameType && currentUri === wanted.IntegrationUri) return currentTarget;

  const shared = routes.some(
    (route) => route.RouteId !== routeId && route.Target === currentTarget,
  );
  if (shared) return integrationTarget(await createIntegration(v2, apiId, apiType, values));

  // Cùng loại thì giữ payload format IaC đã đặt; đổi loại (Lambda ↔ HTTP proxy) mới cần format mới
  const { PayloadFormatVersion, ...destination } = wanted;
  await v2.send(
    new UpdateIntegrationCommand({
      ApiId: apiId,
      IntegrationId: integrationId,
      ...destination,
      ...(sameType ? {} : { PayloadFormatVersion }),
    }),
  );
  return currentTarget;
}

export async function updateRoute(
  v2: ApiGatewayV2Client,
  apiId: string,
  apiType: ApiType,
  routeId: string,
  values: RouteValues,
  authorization: Authorization,
) {
  const route = await v2.send(new GetRouteCommand({ ApiId: apiId, RouteId: routeId }));
  // "other": integration console không sửa (do CDK tạo), giữ nguyên
  const target =
    values.integration === "other"
      ? route.Target
      : await retarget(v2, apiId, apiType, routeId, route.Target, values);
  const turnOnTwoWay = isTwoWay(apiType, values) && !route.RouteResponseSelectionExpression;

  await v2.send(
    new UpdateRouteCommand({
      ApiId: apiId,
      RouteId: routeId,
      RouteKey: values.routeKey,
      Target: target,
      ...routeAuthorization(authorization),
      // Chỉ đổi AuthorizationType thì Floci giữ AuthorizerId cũ: "" để gỡ
      AuthorizerId: authorization.authorizerId ?? "",
      RouteResponseSelectionExpression: turnOnTwoWay ? DEFAULT_KEY : undefined,
    }),
  );
  if (turnOnTwoWay) await addRouteResponse(v2, apiId, routeId);
}

// Console không có màn hình integration: integration không còn route nào dùng thì xóa theo
export async function deleteRoute(v2: ApiGatewayV2Client, apiId: string, routeId: string) {
  const route = await v2.send(new GetRouteCommand({ ApiId: apiId, RouteId: routeId }));
  await v2.send(new DeleteRouteCommand({ ApiId: apiId, RouteId: routeId }));

  const integrationId = integrationIdOf(route.Target);
  if (!integrationId) return;
  const routes = await getRoutes(v2, apiId);
  if (!routes.some((other) => other.Target === route.Target)) {
    await v2.send(new DeleteIntegrationCommand({ ApiId: apiId, IntegrationId: integrationId }));
  }
}
