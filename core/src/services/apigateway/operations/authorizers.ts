import {
  AuthorizerType,
  CreateAuthorizerCommand,
  DeleteAuthorizerCommand,
  UpdateAuthorizerCommand,
  type APIGatewayClient,
  type PatchOperation,
} from "@aws-sdk/client-api-gateway";
import {
  AuthorizerType as AuthorizerTypeV2,
  CreateAuthorizerCommand as CreateAuthorizerV2Command,
  DeleteAuthorizerCommand as DeleteAuthorizerV2Command,
  UpdateAuthorizerCommand as UpdateAuthorizerV2Command,
  type ApiGatewayV2Client,
} from "@aws-sdk/client-apigatewayv2";
import { API_TYPES, type ApiType, type AuthorizerRow } from "#services/apigateway/apis.ts";
import {
  cognitoPoolArn,
  identitySources,
  isLambdaAuthorizer,
} from "#services/apigateway/authorizers.ts";
import {
  AUTHORIZER_TYPES,
  IDENTITY_LIST_SEPARATOR,
  PAYLOAD_FORMAT_VERSIONS,
} from "#services/apigateway/constants.ts";
import { lambdaInvocationUri } from "#services/apigateway/integration.ts";
import { API_VERSIONS } from "#services/apigateway/paths.ts";
import type { AuthorizerValues } from "#services/apigateway/schemas.ts";
import type { ApiRef } from "./apis.ts";

// Loại trong form là chuỗi; mỗi bản API chỉ nhận loại của nó
const REST_TYPES: readonly AuthorizerType[] = Object.values(AuthorizerType);
const V2_TYPES: readonly AuthorizerTypeV2[] = Object.values(AuthorizerTypeV2);

// Phần chung của create / update theo từng bản API
function fieldsOf(region: string, apiType: ApiType, values: AuthorizerValues) {
  const lambda = isLambdaAuthorizer(values.type);
  return {
    sources: identitySources(apiType, values.identityKind, values.identityNames),
    authorizerUri: lambda ? lambdaInvocationUri(region, values.functionArn) : undefined,
    poolArn:
      values.type === AUTHORIZER_TYPES.cognito ? cognitoPoolArn(region, values.poolId) : undefined,
    jwt:
      values.type === AUTHORIZER_TYPES.jwt
        ? { Issuer: values.issuer, Audience: values.audience }
        : undefined,
  };
}

export async function createAuthorizer(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  region: string,
  { version, apiId }: ApiRef,
  apiType: ApiType,
  values: AuthorizerValues,
) {
  const { sources, authorizerUri, poolArn, jwt } = fieldsOf(region, apiType, values);
  if (version === API_VERSIONS.rest) {
    const { id = "" } = await v1.send(
      new CreateAuthorizerCommand({
        restApiId: apiId,
        name: values.name,
        type: REST_TYPES.find((type) => type === values.type),
        authorizerUri,
        providerARNs: poolArn ? [poolArn] : undefined,
        identitySource: sources.join(IDENTITY_LIST_SEPARATOR),
      }),
    );
    return id;
  }

  // HTTP Lambda authorizer: payload 2.0 với simple response { isAuthorized }
  const simple = apiType === API_TYPES.http && Boolean(authorizerUri);
  const { AuthorizerId = "" } = await v2.send(
    new CreateAuthorizerV2Command({
      ApiId: apiId,
      Name: values.name,
      AuthorizerType: V2_TYPES.find((type) => type === values.type),
      AuthorizerUri: authorizerUri,
      IdentitySource: sources,
      JwtConfiguration: jwt,
      AuthorizerPayloadFormatVersion: simple ? PAYLOAD_FORMAT_VERSIONS.v2 : undefined,
      EnableSimpleResponses: simple || undefined,
    }),
  );
  return AuthorizerId;
}

// Floci 2.4.0 không nhận patch /providerARNs (Unsupported path): pool Cognito khóa khi sửa
function restPatch(values: AuthorizerValues, fields: ReturnType<typeof fieldsOf>) {
  const operations: PatchOperation[] = [
    { op: "replace", path: "/name", value: values.name },
    { op: "replace", path: "/identitySource", value: fields.sources.join(IDENTITY_LIST_SEPARATOR) },
  ];
  if (fields.authorizerUri) {
    operations.push({ op: "replace", path: "/authorizerUri", value: fields.authorizerUri });
  }
  return operations;
}

export async function updateAuthorizer(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  region: string,
  { version, apiId }: ApiRef,
  apiType: ApiType,
  current: AuthorizerRow,
  values: AuthorizerValues,
) {
  const fields = fieldsOf(region, apiType, values);
  if (version === API_VERSIONS.rest) {
    await v1.send(
      new UpdateAuthorizerCommand({
        restApiId: apiId,
        authorizerId: current.id,
        patchOperations: restPatch(values, fields),
      }),
    );
    return;
  }
  await v2.send(
    new UpdateAuthorizerV2Command({
      ApiId: apiId,
      AuthorizerId: current.id,
      Name: values.name,
      AuthorizerUri: fields.authorizerUri,
      IdentitySource: fields.sources,
      JwtConfiguration: fields.jwt,
    }),
  );
}

// Authorizer còn method / route dùng: lỗi của Floci hiện nguyên văn
export async function deleteAuthorizer(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
  authorizerId: string,
) {
  if (version === API_VERSIONS.rest) {
    await v1.send(new DeleteAuthorizerCommand({ restApiId: apiId, authorizerId }));
    return;
  }
  await v2.send(new DeleteAuthorizerV2Command({ ApiId: apiId, AuthorizerId: authorizerId }));
}
