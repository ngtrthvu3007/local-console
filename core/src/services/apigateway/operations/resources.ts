import {
  CreateResourceCommand,
  DeleteMethodCommand,
  DeleteResourceCommand,
  PutIntegrationCommand,
  PutMethodCommand,
  UpdateMethodCommand,
  type APIGatewayClient,
} from "@aws-sdk/client-api-gateway";
import type { Authorization } from "#services/apigateway/authorizers.ts";
import { INTEGRATION_TYPES, LAMBDA_INVOKE_METHOD } from "#services/apigateway/constants.ts";
import { lambdaInvocationUri } from "#services/apigateway/integration.ts";
import type { MethodValues } from "#services/apigateway/schemas.ts";

export async function createResource(
  v1: APIGatewayClient,
  apiId: string,
  parentId: string,
  pathPart: string,
) {
  const resource = await v1.send(
    new CreateResourceCommand({ restApiId: apiId, parentId, pathPart }),
  );
  return resource.id ?? "";
}

// Floci không xóa resource con theo cha (spec 7 #21): console chỉ cho xóa resource lá
export const deleteResource = (v1: APIGatewayClient, apiId: string, resourceId: string) =>
  v1.send(new DeleteResourceCommand({ restApiId: apiId, resourceId }));

const integrationOf = (region: string, values: MethodValues) =>
  values.integration === "lambda"
    ? {
        type: INTEGRATION_TYPES.awsProxy,
        integrationHttpMethod: LAMBDA_INVOKE_METHOD,
        uri: lambdaInvocationUri(region, values.functionArn),
      }
    : {
        type: INTEGRATION_TYPES.httpProxy,
        integrationHttpMethod: values.httpMethod,
        uri: values.url,
      };

// Chỉ đổi authorizationType thì Floci giữ authorizerId cũ: gửi "" để gỡ (patch remove không có tác dụng)
const authorizationPatch = ({ authorizationType, authorizerId = "" }: Authorization) => [
  { op: "replace" as const, path: "/authorizationType", value: authorizationType },
  { op: "replace" as const, path: "/authorizerId", value: authorizerId },
];

// Sửa: PutIntegration ghi đè đích (spec 7 #22); integration "other" (do CDK tạo) giữ nguyên
export async function saveMethod(
  v1: APIGatewayClient,
  region: string,
  apiId: string,
  resourceId: string,
  values: MethodValues,
  authorization: Authorization,
  isNew: boolean,
) {
  const method = { restApiId: apiId, resourceId, httpMethod: values.httpMethod };
  if (isNew) {
    await v1.send(new PutMethodCommand({ ...method, ...authorization }));
  } else {
    await v1.send(
      new UpdateMethodCommand({ ...method, patchOperations: authorizationPatch(authorization) }),
    );
  }
  if (values.integration !== "other") {
    await v1.send(new PutIntegrationCommand({ ...method, ...integrationOf(region, values) }));
  }
}

export const deleteMethod = (
  v1: APIGatewayClient,
  apiId: string,
  resourceId: string,
  httpMethod: string,
) => v1.send(new DeleteMethodCommand({ restApiId: apiId, resourceId, httpMethod }));
