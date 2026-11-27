import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APIGatewayClient,
  CreateAuthorizerCommand,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetAuthorizersCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateRouteResponseCommand,
  CreateStageCommand,
  type CreateApiCommandOutput,
  DeleteApiCommand,
  GetApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { CFN_API_TYPES } from "../../core/src/services/apigateway/constants.ts";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { isNotFoundError } from "../../core/src/shared/aws/errors.ts";
import { listApis } from "../../core/src/services/apigateway/operations/apis.ts";
import { apiGatewaySourcesOf } from "../../core/src/services/apigateway/lambdaPermissions.ts";
import {
  buildTestPath,
  restInvokeUrl,
  testInvokeUrl,
  webSocketUrl,
} from "../../core/src/services/apigateway/invokeUrl.ts";
import { AWS_PROXY_PATH } from "../../web/src/shared/constants.ts";
import {
  ACCOUNT_ID,
  CONSOLE_URL,
  consoleConfig,
  createTestFunction,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

const restName = uniqueName("rest");
const httpName = uniqueName("http");
const wsName = uniqueName("ws");

let v1: APIGatewayClient;
let v2: ApiGatewayV2Client;
const restIds: string[] = [];
const v2Ids: string[] = [];
let restId: string;
let http: CreateApiCommandOutput;
let ws: CreateApiCommandOutput;

beforeAll(async () => {
  const { region } = await consoleConfig();
  v1 = new APIGatewayClient(viaConsole(region));
  v2 = new ApiGatewayV2Client(viaConsole(region));
  restId = await createRest();
  http = await v2.send(new CreateApiCommand({ Name: httpName, ProtocolType: "HTTP" }));
  ws = await v2.send(
    new CreateApiCommand({
      Name: wsName,
      ProtocolType: "WEBSOCKET",
      RouteSelectionExpression: "$request.body.action",
    }),
  );
  v2Ids.push(http.ApiId!, ws.ApiId!);
});

afterAll(async () => {
  for (const id of restIds)
    await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
  for (const id of v2Ids) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
});

const createRest = async () => {
  const { id } = await v1.send(new CreateRestApiCommand({ name: restName }));
  restIds.push(id!);
  return id!;
};

describe("api gateway through the console proxy", () => {
  it("lists REST, HTTP and WebSocket APIs through the console proxy", async () => {
    const { rows } = await listApis(v1, v2);
    const typeOf = (id: string) => rows.find((row) => row.id === id)?.type;
    expect(typeOf(restId)).toBe("REST");
    expect(typeOf(http.ApiId!)).toBe("HTTP");
    expect(typeOf(ws.ApiId!)).toBe("WebSocket");
  });

  it("reads resources with embedded methods", async () => {
    const { items } = await v1.send(new GetResourcesCommand({ restApiId: restId }));
    const root = items![0].id!;
    await v1.send(
      new PutMethodCommand({
        restApiId: restId,
        resourceId: root,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );
    await v1.send(
      new PutIntegrationCommand({
        restApiId: restId,
        resourceId: root,
        httpMethod: "GET",
        type: "MOCK",
      }),
    );
    const embedded = await v1.send(
      new GetResourcesCommand({ restApiId: restId, embed: ["methods"] }),
    );
    expect(embedded.items![0].resourceMethods?.GET?.methodIntegration).toBeDefined();
  });

  it("reports an unknown REST API as not found and lists no authorizers", async () => {
    const missing = await v1.send(new GetRestApiCommand({ restApiId: "nope" })).catch((e) => e);
    expect(isNotFoundError(missing)).toBe(true);
    const { items } = await v1.send(new GetAuthorizersCommand({ restApiId: restId }));
    expect(items ?? []).toEqual([]);
  });

  it("deletes REST and HTTP APIs", async () => {
    await v1.send(new DeleteRestApiCommand({ restApiId: restId }));
    await v2.send(new DeleteApiCommand({ ApiId: v2Ids[0] }));
    await expect(v1.send(new GetRestApiCommand({ restApiId: restId }))).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    expect((await listApis(v1, v2)).rows.some((row) => row.id === v2Ids[0])).toBe(false);
  });
});

describe("stages invoke URLs", () => {
  const fnName = uniqueName("fn");
  const LAMBDA_BODY = "from-lambda";
  const STAGE = "dev";
  const WS_WAIT_MS = 5000;
  let lambda: LambdaClient;
  let fnArn: string;
  let publicUrl: string;
  let region: string;
  const apiIds: string[] = [];
  const restIdsHere: string[] = [];

  beforeAll(async () => {
    ({ region, flociPublicUrl: publicUrl } = await consoleConfig());
    lambda = new LambdaClient(viaConsole(region));
    fnArn = (
      await createTestFunction(lambda, {
        name: fnName,
        source: `export const handler = async () => ({ statusCode: 200, body: "${LAMBDA_BODY}" });`,
      })
    ).arn;
  });

  afterAll(async () => {
    for (const id of restIdsHere)
      await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
    for (const id of apiIds) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })).catch(() => {});
  });

  it("the invoke URL from Stages answers", async () => {
    const id = (await v1.send(new CreateRestApiCommand({ name: uniqueName("inv") }))).id!;
    restIdsHere.push(id);
    const root = (await v1.send(new GetResourcesCommand({ restApiId: id }))).items![0].id!;
    const { id: resourceId } = await v1.send(
      new CreateResourceCommand({ restApiId: id, parentId: root, pathPart: "items" }),
    );
    await v1.send(
      new PutMethodCommand({
        restApiId: id,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );
    await v1.send(
      new PutIntegrationCommand({
        restApiId: id,
        resourceId,
        httpMethod: "GET",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${fnArn}/invocations`,
      }),
    );
    await v1.send(new CreateDeploymentCommand({ restApiId: id, stageName: STAGE }));
    const rest = await fetch(`${restInvokeUrl(publicUrl, id, STAGE)}items`);
    expect(rest.status).toBe(200);
    expect(await rest.text()).toBe(LAMBDA_BODY);

    const api = await v2.send(
      new CreateApiCommand({ Name: uniqueName("inv2"), ProtocolType: "HTTP" }),
    );
    apiIds.push(api.ApiId!);
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({
        ApiId: api.ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: fnArn,
        PayloadFormatVersion: "2.0",
      }),
    );
    await v2.send(
      new CreateRouteCommand({
        ApiId: api.ApiId,
        RouteKey: "$default",
        Target: `integrations/${IntegrationId}`,
      }),
    );
    await v2.send(new CreateStageCommand({ ApiId: api.ApiId, StageName: "$default" }));
    const http = await fetch(`${restInvokeUrl(publicUrl, api.ApiId!, "$default")}items`);
    expect(http.status).toBe(200);
    expect(await http.text()).toBe(LAMBDA_BODY);
  });

  it("the WebSocket URL connects", async () => {
    const api = await v2.send(
      new CreateApiCommand({
        Name: uniqueName("inv-ws"),
        ProtocolType: "WEBSOCKET",
        RouteSelectionExpression: "$request.body.action",
      }),
    );
    apiIds.push(api.ApiId!);
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({
        ApiId: api.ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: fnArn,
      }),
    );
    const { RouteId } = await v2.send(
      new CreateRouteCommand({
        ApiId: api.ApiId,
        RouteKey: "$default",
        Target: `integrations/${IntegrationId}`,
        RouteResponseSelectionExpression: "$default",
      }),
    );
    await v2.send(
      new CreateRouteResponseCommand({
        ApiId: api.ApiId,
        RouteId,
        RouteResponseKey: "$default",
      }),
    );
    await v2.send(new CreateStageCommand({ ApiId: api.ApiId, StageName: STAGE }));
    const socket = new WebSocket(webSocketUrl(publicUrl, region, api.ApiId!, STAGE));
    // Chờ một sự kiện, quá hạn thì lỗi rõ ràng thay vì treo tới timeout của vitest
    const next = (type: "open" | "message", what: string) =>
      new Promise<Event>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`WebSocket: no ${what} within ${WS_WAIT_MS} ms`)),
          WS_WAIT_MS,
        );
        socket.addEventListener(type, (event) => {
          clearTimeout(timer);
          resolve(event);
        });
        socket.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error(`WebSocket error while waiting for ${what}`));
        });
      });
    try {
      await next("open", "open");
      const reply = next("message", "Lambda reply");
      socket.send(JSON.stringify({ action: "x" }));
      expect(String(((await reply) as MessageEvent).data)).toContain(LAMBDA_BODY);
    } finally {
      socket.close();
    }
  });
});

describe("lambda permission for API Gateway", () => {
  const fnName = uniqueName("perm");
  let lambda: LambdaClient;
  let region: string;

  beforeAll(async () => {
    ({ region } = await consoleConfig());
    lambda = new LambdaClient(viaConsole(region));
    await createTestFunction(lambda, {
      name: fnName,
      source: "export const handler = async () => ({});",
    });
  });

  afterAll(async () => {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })).catch(() => {});
  });

  it("AddPermission with an execute-api SourceArn comes back from GetPolicy and parses", async () => {
    const sourceArn = (tail: string) => `arn:aws:execute-api:${region}:${ACCOUNT_ID}:${tail}`;
    for (const [id, tail] of [
      ["rest", "r1abcdef/*/GET/items/*"],
      ["http", "h2abcdef/*/*/*"],
    ])
      await lambda.send(
        new AddPermissionCommand({
          FunctionName: fnName,
          StatementId: `lc-it-${id}`,
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          SourceArn: sourceArn(tail),
        }),
      );

    const { Policy } = await lambda.send(new GetPolicyCommand({ FunctionName: fnName }));

    expect(apiGatewaySourcesOf(Policy!)).toEqual([
      { apiId: "r1abcdef", stage: "*", method: "GET", path: "/items/*" },
      { apiId: "h2abcdef", stage: "*", method: "*", path: "/*" },
    ]);
  });
});

describe("CloudFormation", () => {
  const stackName = uniqueName("apigw-cfn");
  let cloudformation: CloudFormationClient;
  let resources: { type?: string; physicalId?: string }[];

  beforeAll(async () => {
    cloudformation = new CloudFormationClient(viaConsole((await consoleConfig()).region));
    await cloudformation.send(
      new CreateStackCommand({
        StackName: stackName,
        TemplateBody: JSON.stringify({
          AWSTemplateFormatVersion: "2010-09-09",
          Resources: {
            Rest: { Type: CFN_API_TYPES.v1, Properties: { Name: uniqueName("cfn-rest") } },
            Http: {
              Type: CFN_API_TYPES.v2,
              Properties: { Name: uniqueName("cfn-http"), ProtocolType: "HTTP" },
            },
          },
        }),
      }),
    );
    await waitFor(`stack ${stackName} to settle`, async () => {
      const { Stacks } = await cloudformation.send(
        new DescribeStacksCommand({ StackName: stackName }),
      );
      return Stacks?.[0]?.StackStatus?.endsWith("_IN_PROGRESS") ? undefined : Stacks?.[0];
    });
    const listed = await cloudformation.send(
      new ListStackResourcesCommand({ StackName: stackName }),
    );
    resources = (listed.StackResourceSummaries ?? []).map((r) => ({
      type: r.ResourceType,
      physicalId: r.PhysicalResourceId,
    }));
  });

  afterAll(async () => {
    await cloudformation.send(new DeleteStackCommand({ StackName: stackName })).catch(() => {});
  });

  const physicalIdOf = (type: string) => resources.find((r) => r.type === type)?.physicalId;

  it("AWS::ApiGateway::RestApi has the REST API id as physical id", async () => {
    const id = physicalIdOf(CFN_API_TYPES.v1);
    expect(id).toBeTruthy();
    expect((await v1.send(new GetRestApiCommand({ restApiId: id! }))).id).toBe(id);
  });

  it("AWS::ApiGatewayV2::Api has the API id as physical id", async () => {
    const id = physicalIdOf(CFN_API_TYPES.v2);
    expect(id).toBeTruthy();
    expect((await v2.send(new GetApiCommand({ ApiId: id! }))).ApiId).toBe(id);
  });
});

describe("testing a REST method through _user_request_", () => {
  const fnName = uniqueName("echo");
  const STAGE = "test";
  const PATH_VALUE = "a b";
  const QUERY_VALUE = "abc";
  const HEADER_NAME = "x-a";
  const HEADER_VALUE = "1";
  const BODY = '{"a":1}';
  const PASSWORD = "Passw0rd!Passw0rd!";
  // Trả lại phần Floci chuyển cho Lambda để so với những gì client đã gửi
  const ECHO_HANDLER = `export const handler = async (event) => ({
    statusCode: 200,
    body: JSON.stringify({
      id: event.pathParameters?.id,
      q: event.queryStringParameters?.q,
      header: event.headers?.["${HEADER_NAME}"],
      body: event.body,
    }),
  });`;
  let lambda: LambdaClient;
  let cognito: CognitoIdentityProviderClient;
  let publicRegion: string;
  let poolId: string;
  let echoId: string;
  let authedId: string;
  let strandedId: string;
  let failingId: string;
  let tokenId: string;
  let iamId: string;
  const apiIds: string[] = [];
  const strandedFn = uniqueName("gone");
  const failingFn = uniqueName("fail");
  const authFn = uniqueName("auth");
  // Lambda TOKEN authorizer: token "allow" → Allow, còn lại → Deny
  const AUTH_HANDLER = `export const handler = async (event) => ({
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{
        Action: "execute-api:Invoke",
        Effect: event.authorizationToken === "allow" ? "Allow" : "Deny",
        Resource: event.methodArn,
      }],
    },
  });`;

  const testUrl = (apiId: string, path: string) =>
    `${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, STAGE, path, "")}`;

  const functionArn = async (name: string) =>
    (await lambda.send(new GetFunctionCommand({ FunctionName: name }))).Configuration!.FunctionArn!;

  const createFunction = (name: string, source: string) =>
    createTestFunction(lambda, { name, source });

  // Một method trên resource `pathPart` (dưới root), tích hợp Lambda proxy, deploy lên STAGE
  const createApi = async (
    pathPart: string,
    httpMethod: string,
    fn: string,
    authorizationType = "NONE",
    createAuthorizer?: (restApiId: string) => Promise<string>,
  ) => {
    const restApiId = (await v1.send(new CreateRestApiCommand({ name: uniqueName("tm") }))).id!;
    apiIds.push(restApiId);
    const root = (await v1.send(new GetResourcesCommand({ restApiId }))).items![0].id!;
    const { id: resourceId } = await v1.send(
      new CreateResourceCommand({ restApiId, parentId: root, pathPart }),
    );
    const authorizerId = createAuthorizer ? await createAuthorizer(restApiId) : undefined;
    await v1.send(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod,
        authorizationType,
        authorizerId,
      }),
    );
    await v1.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${publicRegion}:lambda:path/2015-03-31/functions/${await functionArn(fn)}/invocations`,
      }),
    );
    await v1.send(new CreateDeploymentCommand({ restApiId, stageName: STAGE }));
    return restApiId;
  };

  beforeAll(async () => {
    ({ region: publicRegion } = await consoleConfig());
    lambda = new LambdaClient(viaConsole(publicRegion));
    cognito = new CognitoIdentityProviderClient(viaConsole(publicRegion));
    await createFunction(fnName, ECHO_HANDLER);
    await createFunction(strandedFn, ECHO_HANDLER);
    echoId = await createApi("{id}", "POST", fnName);
    strandedId = await createApi("gone", "GET", strandedFn);
    await lambda.send(new DeleteFunctionCommand({ FunctionName: strandedFn }));
    await createFunction(
      failingFn,
      `export const handler = async () => { throw new Error("boom"); };`,
    );
    failingId = await createApi("fail", "GET", failingFn);
    await createFunction(authFn, AUTH_HANDLER);
    tokenId = await createApi(
      "secret",
      "GET",
      fnName,
      "CUSTOM",
      async (restApiId) =>
        (
          await v1.send(
            new CreateAuthorizerCommand({
              restApiId,
              name: "token-auth",
              type: "TOKEN",
              authorizerUri: `arn:aws:apigateway:${publicRegion}:lambda:path/2015-03-31/functions/${await functionArn(authFn)}/invocations`,
              identitySource: "method.request.header.Authorization",
            }),
          )
        ).id!,
    );
    iamId = await createApi("signed", "GET", fnName, "AWS_IAM");
    poolId = (await cognito.send(new CreateUserPoolCommand({ PoolName: uniqueName("pool") })))
      .UserPool!.Id!;
    authedId = await createApi(
      "items",
      "GET",
      fnName,
      "COGNITO_USER_POOLS",
      async (restApiId) =>
        (
          await v1.send(
            new CreateAuthorizerCommand({
              restApiId,
              name: "cognito-auth",
              type: "COGNITO_USER_POOLS",
              providerARNs: [
                `arn:aws:cognito-idp:${publicRegion}:${ACCOUNT_ID}:userpool/${poolId}`,
              ],
              identitySource: "method.request.header.Authorization",
            }),
          )
        ).id!,
    );
  });

  afterAll(async () => {
    for (const id of apiIds)
      await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })).catch(() => {});
    await lambda.send(new DeleteFunctionCommand({ FunctionName: strandedFn })).catch(() => {});
    for (const name of [failingFn, authFn])
      await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })).catch(() => {});
  });

  const idTokenOf = async () => {
    const { UserPoolClient } = await cognito.send(
      new CreateUserPoolClientCommand({
        UserPoolId: poolId,
        ClientName: uniqueName("client"),
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      }),
    );
    const username = uniqueName("user");
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: username,
        TemporaryPassword: PASSWORD,
        MessageAction: "SUPPRESS",
      }),
    );
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: poolId,
        Username: username,
        Password: PASSWORD,
        Permanent: true,
      }),
    );
    const { AuthenticationResult } = await cognito.send(
      new InitiateAuthCommand({
        ClientId: UserPoolClient!.ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: username, PASSWORD },
      }),
    );
    return AuthenticationResult!.IdToken!;
  };

  it("path param, query, header and body reach the Lambda", async () => {
    const path = buildTestPath("/{id}", { id: PATH_VALUE });
    const response = await fetch(
      `${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, echoId, STAGE, path, `q=${QUERY_VALUE}`)}`,
      { method: "POST", headers: { [HEADER_NAME]: HEADER_VALUE }, body: BODY },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: PATH_VALUE,
      q: QUERY_VALUE,
      header: HEADER_VALUE,
      body: BODY,
    });
  });

  it("a Cognito method answers 401 without a token and 200 with the IdToken", async () => {
    const withoutToken = await fetch(testUrl(authedId, "/items"));
    const withToken = await fetch(testUrl(authedId, "/items"), {
      headers: { Authorization: await idTokenOf() },
    });

    expect(withoutToken.status).toBe(401);
    expect(withToken.status).toBe(200);
  });

  it("a deleted Lambda answers 404 with the Floci message", async () => {
    const response = await fetch(testUrl(strandedId, "/gone"));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain(
      `Function not found: arn:aws:lambda:${publicRegion}:${ACCOUNT_ID}:function:${strandedFn}`,
    );
  });

  it("reaches the Lambda without lambda:AddPermission (Floci doesn't check the resource policy)", async () => {
    const policy = lambda.send(new GetPolicyCommand({ FunctionName: fnName }));

    await expect(policy).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    expect((await fetch(testUrl(echoId, "/1"), { method: "POST" })).status).toBe(200);
  });

  it("a Lambda that throws answers 502 with an empty body", async () => {
    const response = await fetch(testUrl(failingId, "/fail"));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
  });

  it("a Lambda TOKEN authorizer answers 401 without a token, 403 on Deny, 200 on Allow", async () => {
    const call = (token?: string) =>
      fetch(testUrl(tokenId, "/secret"), token ? { headers: { Authorization: token } } : {});

    expect((await call()).status).toBe(401);
    expect((await call("deny")).status).toBe(403);
    expect((await call("allow")).status).toBe(200);
  });

  it("an AWS_IAM method answers 403 Missing Authentication Token to an unsigned call", async () => {
    const response = await fetch(testUrl(iamId, "/signed"));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Missing Authentication Token");
  });
});
