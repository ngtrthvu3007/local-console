import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APIGatewayClient,
  GetMethodCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client, GetIntegrationsCommand } from "@aws-sdk/client-apigatewayv2";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { strToU8, zipSync } from "fflate";
import { API_TYPES, type ApiType } from "../../core/src/services/apigateway/apis.ts";
import { testInvokeUrl, webSocketUrl } from "../../core/src/services/apigateway/invokeUrl.ts";
import {
  apiGatewaySourcesOf,
  executeApiSourceArn,
  permissionStatementId,
  type PermissionTarget,
} from "../../core/src/services/apigateway/lambdaPermissions.ts";
import type { ApiRef } from "../../core/src/services/apigateway/operations/apis.ts";
import {
  createApiGatewayService,
  type ApiGatewayService,
} from "../../core/src/services/apigateway/service.ts";
import { addPermission } from "../../core/src/services/lambda/operations/functions.ts";
import { cognitoPoolArn } from "../../core/src/services/apigateway/authorizers.ts";
import type { AuthorizerValues, RouteValues } from "../../core/src/services/apigateway/schemas.ts";
import { AWS_PROXY_PATH } from "../../web/src/shared/constants.ts";
import {
  ACCOUNT_ID,
  CONSOLE_URL,
  consoleConfig,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Tạo / sửa / xóa API Gateway bằng facade của core (đường console dùng), gọi qua proxy /aws.
// Hành vi Floci 2.4.0: spec 2026-11-27-apigateway-crud mục 7

const STAGE = "test";

const WS_WAIT_MS = 5000;

let region: string;
let publicUrl: string;
let v2: ApiGatewayV2Client;
let lambda: LambdaClient;
let v1: APIGatewayClient;
let apigateway: ApiGatewayService;
const apis: ApiRef[] = [];
const functions: string[] = [];

async function createFunction(source: string) {
  const name = uniqueName("apigw-crud-fn");
  functions.push(name);
  const { FunctionArn } = await lambda.send(
    new CreateFunctionCommand({
      FunctionName: name,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
      Code: { ZipFile: zipSync({ "index.mjs": strToU8(source) }) },
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: name }));
    return Configuration?.State === "Active" ? true : undefined;
  });
  return { name, arn: FunctionArn! };
}

const replying = (text: string) =>
  createFunction(`export const handler = async () => ({ statusCode: 200, body: "${text}" });`);

const apiValues = (type: ApiType, values: { functionArn?: string; grant?: boolean } = {}) => ({
  type,
  name: uniqueName("apigw-crud"),
  description: "",
  functionArn: values.functionArn ?? "",
  grant: values.grant ?? true,
  routeSelection: type === API_TYPES.websocket ? "$request.body.action" : "",
});

async function createApi(type: ApiType, values?: { functionArn?: string; grant?: boolean }) {
  const { api, failures } = await apigateway.createApi(apiValues(type, values));
  apis.push(api);
  expect(failures).toEqual([]);
  return api;
}

const invoke = (apiId: string, stage: string, path: string, init?: RequestInit) =>
  fetch(`${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, stage, path, "")}`, init);

const sourcesOf = async (functionName: string) => {
  const { Policy = "" } = await lambda.send(new GetPolicyCommand({ FunctionName: functionName }));
  return apiGatewaySourcesOf(Policy);
};

// Method REST như form gửi: Lambda proxy, không authorizer
const lambdaMethod = (httpMethod: string, functionArn: string) => ({
  httpMethod,
  integration: "lambda" as const,
  functionArn,
  grant: true,
  url: "",
  authorization: "NONE",
});
const NO_AUTH = { authorizationType: "NONE" };

const resourceAt = async (apiId: string, path: string) => {
  const resource = (await apigateway.listResources(apiId)).find((r) => r.path === path);
  return { id: resource?.id ?? "", path };
};

// REST API đã có stage "test" (Floci chạy cấu hình mới nhất trên mọi stage)
async function restApiWithStage() {
  const api = await createApi(API_TYPES.rest);
  await apigateway.createStage(api, STAGE, false);
  return { api, root: await resourceAt(api.apiId, "/") };
}

beforeAll(async () => {
  ({ region, flociPublicUrl: publicUrl } = await consoleConfig());
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  v1 = new APIGatewayClient(config);
  v2 = new ApiGatewayV2Client(config);
  apigateway = createApiGatewayService(v1, {
    v2,
    lambda,
    region,
  });
});

afterAll(async () => {
  for (const api of apis) await apigateway.deleteApi(api).catch(() => {});
  for (const name of functions)
    await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
});

describe("APIs and stages", () => {
  it("an HTTP API created with a Lambda answers from it and shows in the function policy", async () => {
    const fn = await replying("from-quick-create");
    const api = await createApi(API_TYPES.http, { functionArn: fn.arn });

    const response = await invoke(api.apiId, "$default", "/anything");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("from-quick-create");
    expect(await sourcesOf(fn.name)).toContainEqual({
      apiId: api.apiId,
      stage: "*",
      method: "$default",
      path: "",
    });
  });

  it("granting twice keeps one statement", async () => {
    const fn = await replying("twice");
    const target: PermissionTarget = { kind: "route", routeKey: "GET /twice" };
    const input = {
      functionArn: fn.arn,
      statementId: permissionStatementId("twice1", target),
      sourceArn: executeApiSourceArn(region, "twice1", target),
    };
    await addPermission(lambda, input);
    await addPermission(lambda, input);

    const { Policy = "" } = await lambda.send(new GetPolicyCommand({ FunctionName: fn.name }));
    const statements: { Sid?: string }[] = JSON.parse(Policy).Statement;
    expect(statements.filter(({ Sid }) => Sid === input.statementId)).toHaveLength(1);
  });

  it("an HTTP API without a Lambda gets an auto-deploying $default stage", async () => {
    const api = await createApi(API_TYPES.http);
    expect((await apigateway.listStages(api)).map((stage) => stage.name)).toEqual(["$default"]);
  });

  it("a REST API answers Stage not found until a stage is created", async () => {
    const api = await createApi(API_TYPES.rest);
    expect(await (await invoke(api.apiId, "dev", "/")).text()).toContain("Stage not found");

    await apigateway.createStage(api, "dev", false);
    expect((await apigateway.listStages(api)).map((stage) => stage.name)).toEqual(["dev"]);
    expect(await (await invoke(api.apiId, "dev", "/")).text()).not.toContain("Stage not found");

    await apigateway.deleteStage(api, "dev");
    expect(await apigateway.listStages(api)).toEqual([]);
  });

  it("createStage and deleteStage work on a WebSocket API", async () => {
    const api = await createApi(API_TYPES.websocket);
    await apigateway.createStage(api, "dev", false);
    expect((await apigateway.listStages(api)).map((stage) => stage.name)).toEqual(["dev"]);
    await apigateway.deleteStage(api, "dev");
    expect(await apigateway.listStages(api)).toEqual([]);
  });

  it("updateApi renames REST and HTTP APIs and changes the WebSocket route selection", async () => {
    for (const type of [API_TYPES.rest, API_TYPES.http]) {
      const api = await createApi(type);
      await apigateway.updateApi(api, {
        name: "renamed",
        description: "new description",
        routeSelection: "",
      });
      expect(await apigateway.getApi(api)).toMatchObject({
        name: "renamed",
        description: "new description",
      });
    }

    const ws = await createApi(API_TYPES.websocket);
    await apigateway.updateApi(ws, {
      name: "renamed-ws",
      description: "",
      routeSelection: "$request.body.type",
    });
    expect(await apigateway.getApi(ws)).toMatchObject({
      name: "renamed-ws",
      routeSelection: "$request.body.type",
    });
  });
});

describe("REST resources and methods", () => {
  it("a Lambda proxy method on /items/{id} answers and is granted", async () => {
    const fn = await replying("one-item");
    const { api, root } = await restApiWithStage();
    const items = await apigateway.createResource(api.apiId, root.id, "items");
    const itemId = await apigateway.createResource(api.apiId, items, "{id}");

    const { failures } = await apigateway.saveMethod(
      api.apiId,
      { id: itemId, path: "/items/{id}" },
      lambdaMethod("GET", fn.arn),
      NO_AUTH,
      true,
    );
    expect(failures).toEqual([]);
    const response = await invoke(api.apiId, STAGE, "/items/42");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("one-item");
    expect(await sourcesOf(fn.name)).toContainEqual({
      apiId: api.apiId,
      stage: "*",
      method: "GET",
      path: "/items/{id}",
    });
  });

  it("ANY on {proxy+} proxies to an HTTP backend", async () => {
    const { api, root } = await restApiWithStage();
    const proxyId = await apigateway.createResource(api.apiId, root.id, "{proxy+}");
    await apigateway.saveMethod(
      api.apiId,
      { id: proxyId, path: "/{proxy+}" },
      { ...lambdaMethod("ANY", ""), integration: "http", url: "http://console:3701/api/{proxy}" },
      NO_AUTH,
      true,
    );
    expect((await invoke(api.apiId, STAGE, "/health")).status).toBe(200);
  });

  it("editing a method switches to another function", async () => {
    const [first, second] = [await replying("first"), await replying("second")];
    const { api, root } = await restApiWithStage();
    const resource = {
      id: await apigateway.createResource(api.apiId, root.id, "switch"),
      path: "/switch",
    };
    await apigateway.saveMethod(
      api.apiId,
      resource,
      lambdaMethod("POST", first.arn),
      NO_AUTH,
      true,
    );
    await apigateway.saveMethod(
      api.apiId,
      resource,
      lambdaMethod("POST", second.arn),
      NO_AUTH,
      false,
    );

    expect(await (await invoke(api.apiId, STAGE, "/switch", { method: "POST" })).text()).toBe(
      "second",
    );
  });

  it("saving an AWS integration method keeps its integration", async () => {
    const { api, root } = await restApiWithStage();
    const resourceId = await apigateway.createResource(api.apiId, root.id, "queue");
    const method = { restApiId: api.apiId, resourceId, httpMethod: "POST" };
    const uri = `arn:aws:apigateway:${region}:sqs:path/${ACCOUNT_ID}/lc-it-missing`;
    await v1.send(new PutMethodCommand({ ...method, authorizationType: "NONE" }));
    await v1.send(
      new PutIntegrationCommand({ ...method, type: "AWS", integrationHttpMethod: "POST", uri }),
    );

    await apigateway.saveMethod(
      api.apiId,
      { id: resourceId, path: "/queue" },
      { ...lambdaMethod("POST", ""), integration: "other", authorization: "AWS_IAM" },
      { authorizationType: "AWS_IAM" },
      false,
    );
    const saved = await v1.send(new GetMethodCommand(method));
    expect(saved.authorizationType).toBe("AWS_IAM");
    expect(saved.methodIntegration).toMatchObject({ type: "AWS", uri });
  });

  it("deleteMethod and deleteResource remove them", async () => {
    const fn = await replying("gone");
    const { api, root } = await restApiWithStage();
    const resourceId = await apigateway.createResource(api.apiId, root.id, "gone");
    await apigateway.saveMethod(
      api.apiId,
      { id: resourceId, path: "/gone" },
      lambdaMethod("GET", fn.arn),
      NO_AUTH,
      true,
    );

    await apigateway.deleteMethod(api.apiId, resourceId, "GET");
    const [resource] = (await apigateway.listResources(api.apiId)).filter(
      (r) => r.id === resourceId,
    );
    expect(Object.keys(resource.resourceMethods ?? {})).toEqual([]);

    await apigateway.deleteResource(api.apiId, resourceId);
    expect((await apigateway.listResources(api.apiId)).map((r) => r.path)).toEqual(["/"]);
  });
});

const lambdaRoute = (routeKey: string, functionArn: string, twoWay = false): RouteValues => ({
  routeKey,
  integration: "lambda",
  functionArn,
  grant: true,
  url: "",
  authorization: "NONE",
  twoWay,
});

const routeId = async (apiId: string, key: string) =>
  (await apigateway.listRoutes(apiId)).find((route) => route.key === key)?.id ?? "";

// Mở kết nối mới, gửi một message, gom những gì client nhận trong WS_WAIT_MS
async function repliesTo(apiId: string) {
  const socket = new WebSocket(webSocketUrl(publicUrl, region, apiId, STAGE));
  const received: string[] = [];
  socket.addEventListener("message", (event) => received.push(String(event.data)));
  try {
    await waitFor(
      "socket open",
      async () => (socket.readyState === WebSocket.OPEN ? true : undefined),
      { timeoutMs: WS_WAIT_MS, intervalMs: 100 },
    );
    socket.send(JSON.stringify({ action: "ping" }));
    await new Promise((resolve) => setTimeout(resolve, WS_WAIT_MS));
    return received;
  } finally {
    socket.close();
  }
}

describe("HTTP and WebSocket routes", () => {
  it("an HTTP route to a Lambda answers and is granted", async () => {
    const fn = await replying("from-route");
    const api = await createApi(API_TYPES.http);
    const { failures } = await apigateway.createRoute(
      api.apiId,
      API_TYPES.http,
      lambdaRoute("GET /items/{id}", fn.arn),
      NO_AUTH,
    );

    expect(failures).toEqual([]);
    expect(await (await invoke(api.apiId, "$default", "/items/7")).text()).toBe("from-route");
    expect(await sourcesOf(fn.name)).toContainEqual({
      apiId: api.apiId,
      stage: "*",
      method: "GET",
      path: "/items/{id}",
    });
  });

  it("changing the route key moves the route, and HTTP proxy calls the backend", async () => {
    const fn = await replying("moved");
    const api = await createApi(API_TYPES.http);
    await apigateway.createRoute(
      api.apiId,
      API_TYPES.http,
      lambdaRoute("GET /items/{id}", fn.arn),
      NO_AUTH,
    );
    const id = await routeId(api.apiId, "GET /items/{id}");

    await apigateway.updateRoute(
      api.apiId,
      API_TYPES.http,
      id,
      lambdaRoute("GET /things/{id}", fn.arn),
      NO_AUTH,
    );
    expect(await (await invoke(api.apiId, "$default", "/things/7")).text()).toBe("moved");
    expect((await invoke(api.apiId, "$default", "/items/7")).status).toBe(404);

    await apigateway.updateRoute(
      api.apiId,
      API_TYPES.http,
      id,
      {
        ...lambdaRoute("GET /things/{id}", ""),
        integration: "http",
        url: "http://console:3701/api/health",
      },
      NO_AUTH,
    );
    const proxied = await invoke(api.apiId, "$default", "/things/7");
    expect(proxied.status).toBe(200);
    expect(await proxied.text()).toContain("status");
  });

  it("deleting a route deletes its integration", async () => {
    const fn = await replying("deleted");
    const api = await createApi(API_TYPES.http);
    await apigateway.createRoute(
      api.apiId,
      API_TYPES.http,
      lambdaRoute("GET /gone", fn.arn),
      NO_AUTH,
    );

    await apigateway.deleteRoute(api.apiId, await routeId(api.apiId, "GET /gone"));
    expect(await apigateway.listRoutes(api.apiId)).toEqual([]);
    expect((await v2.send(new GetIntegrationsCommand({ ApiId: api.apiId }))).Items ?? []).toEqual(
      [],
    );
  });

  // Floci 2.4.0: route đã two-way thì không tắt được (Task 5 ruling), nên chỉ kiểm bật
  it("a WebSocket $default route replies to the client once two-way is on", async () => {
    const fn = await replying("pong");
    const api = await createApi(API_TYPES.websocket);
    await apigateway.createRoute(
      api.apiId,
      API_TYPES.websocket,
      lambdaRoute("$default", fn.arn),
      NO_AUTH,
    );
    await apigateway.createStage(api, STAGE, false);
    expect(await repliesTo(api.apiId)).toEqual([]);

    const id = await routeId(api.apiId, "$default");
    await apigateway.updateRoute(
      api.apiId,
      API_TYPES.websocket,
      id,
      lambdaRoute("$default", fn.arn, true),
      NO_AUTH,
    );
    expect((await apigateway.listRoutes(api.apiId))[0].twoWay).toBe(true);
    expect(await repliesTo(api.apiId)).toEqual(["pong"]);
  });
});

const authorizerValues = (values: Partial<AuthorizerValues>): AuthorizerValues => ({
  name: uniqueName("auth"),
  type: "TOKEN",
  functionArn: "",
  grant: true,
  poolId: "",
  issuer: "",
  audience: [],
  identityKind: "header",
  identityNames: ["Authorization"],
  ...values,
});

const authorizerRow = async (api: ApiRef, id: string) =>
  (await apigateway.listAuthorizers(api)).find((row) => row.id === id);

describe("authorizers", () => {
  it("a TOKEN authorizer on a method blocks calls without a token, and comes off again", async () => {
    const authorizer = await createFunction(`export const handler = async (event) => ({
      principalId: "user",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Action: "execute-api:Invoke",
          Effect: event.authorizationToken === "allow" ? "Allow" : "Deny",
          Resource: event.methodArn,
        }],
      },
    });`);
    const backend = await replying("inside");
    const { api, root } = await restApiWithStage();
    const resource = {
      id: await apigateway.createResource(api.apiId, root.id, "guarded"),
      path: "/guarded",
    };
    await apigateway.saveMethod(
      api.apiId,
      resource,
      lambdaMethod("GET", backend.arn),
      NO_AUTH,
      true,
    );

    const { authorizerId, failures } = await apigateway.createAuthorizer(
      api,
      API_TYPES.rest,
      authorizerValues({ functionArn: authorizer.arn }),
    );
    expect(failures).toEqual([]);
    expect(await sourcesOf(authorizer.name)).toContainEqual({
      apiId: api.apiId,
      stage: "authorizers",
      method: authorizerId,
      path: "",
    });

    await apigateway.saveMethod(
      api.apiId,
      resource,
      lambdaMethod("GET", backend.arn),
      { authorizationType: "CUSTOM", authorizerId },
      false,
    );
    const status = async (token?: string) =>
      (
        await invoke(api.apiId, STAGE, "/guarded", {
          headers: token ? { Authorization: token } : {},
        })
      ).status;
    expect(await status()).toBe(401);
    expect(await status("deny")).toBe(403);
    expect(await status("allow")).toBe(200);

    await apigateway.saveMethod(
      api.apiId,
      resource,
      lambdaMethod("GET", backend.arn),
      NO_AUTH,
      false,
    );
    expect(await status()).toBe(200);
    const method = (await apigateway.listResources(api.apiId)).find((r) => r.id === resource.id)
      ?.resourceMethods?.GET;
    expect(method?.authorizationType).toBe("NONE");
    expect(method?.authorizerId).toBeFalsy();
  });

  // Floci không nhận patch /providerARNs: pool khóa khi sửa (Task 6 ruling)
  it("a Cognito authorizer can be created and renamed, keeping its pool", async () => {
    const cognito = new CognitoIdentityProviderClient(viaConsole(region));
    const { UserPool } = await cognito.send(
      new CreateUserPoolCommand({ PoolName: uniqueName("apigw-crud-pool") }),
    );
    const poolId = UserPool!.Id!;
    try {
      const api = await createApi(API_TYPES.rest);
      const values = authorizerValues({ type: "COGNITO_USER_POOLS", poolId });
      const { authorizerId } = await apigateway.createAuthorizer(api, API_TYPES.rest, values);
      const created = await authorizerRow(api, authorizerId);
      expect(created?.providerArns).toEqual([cognitoPoolArn(region, poolId)]);

      await apigateway.updateAuthorizer(api, API_TYPES.rest, created!, {
        ...values,
        name: "renamed",
      });
      expect(await authorizerRow(api, authorizerId)).toMatchObject({
        name: "renamed",
        providerArns: [cognitoPoolArn(region, poolId)],
      });
    } finally {
      await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })).catch(() => {});
    }
  });

  it("an HTTP REQUEST authorizer on a route answers 401 / 403 / 200 from simple responses", async () => {
    const authorizer = await createFunction(
      'export const handler = async (event) => ({ isAuthorized: event.headers?.["x-token"] === "allow" });',
    );
    const backend = await replying("inside");
    const api = await createApi(API_TYPES.http);
    const { authorizerId } = await apigateway.createAuthorizer(
      api,
      API_TYPES.http,
      authorizerValues({
        type: "REQUEST",
        functionArn: authorizer.arn,
        identityNames: ["x-token"],
      }),
    );
    const guarded = { authorizationType: "CUSTOM", authorizerId };
    await apigateway.createRoute(
      api.apiId,
      API_TYPES.http,
      lambdaRoute("GET /guarded", backend.arn),
      guarded,
    );
    const status = async (token?: string) =>
      (
        await invoke(api.apiId, "$default", "/guarded", {
          headers: token ? { "x-token": token } : {},
        })
      ).status;
    expect(await status()).toBe(401);
    expect(await status("deny")).toBe(403);
    expect(await status("allow")).toBe(200);

    const id = await routeId(api.apiId, "GET /guarded");
    await apigateway.updateRoute(
      api.apiId,
      API_TYPES.http,
      id,
      lambdaRoute("GET /guarded", backend.arn),
      NO_AUTH,
    );
    expect(await status()).toBe(200);
    const [route] = await apigateway.listRoutes(api.apiId);
    expect(route.authorizationType).toBe("NONE");
    expect(route.authorizerId).toBeFalsy();
  });

  it("a JWT authorizer keeps its issuer and audience", async () => {
    const api = await createApi(API_TYPES.http);
    const values = authorizerValues({
      type: "JWT",
      issuer: "https://issuer.example.com",
      audience: ["a", "b"],
    });
    const { authorizerId } = await apigateway.createAuthorizer(api, API_TYPES.http, values);
    expect(await authorizerRow(api, authorizerId)).toMatchObject({
      issuer: "https://issuer.example.com",
      audience: ["a", "b"],
    });

    const current = await authorizerRow(api, authorizerId);
    await apigateway.updateAuthorizer(api, API_TYPES.http, current!, {
      ...values,
      audience: ["c"],
    });
    expect((await authorizerRow(api, authorizerId))?.audience).toEqual(["c"]);
  });

  it("deleteAuthorizer removes it", async () => {
    const api = await createApi(API_TYPES.websocket);
    const fn = await replying("unused");
    const { authorizerId } = await apigateway.createAuthorizer(
      api,
      API_TYPES.websocket,
      authorizerValues({
        type: "REQUEST",
        functionArn: fn.arn,
        identityKind: "querystring",
        identityNames: ["token"],
      }),
    );
    expect((await authorizerRow(api, authorizerId))?.identitySource).toBe(
      "route.request.querystring.token",
    );

    await apigateway.deleteAuthorizer(api, authorizerId);
    expect(await apigateway.listAuthorizers(api)).toEqual([]);
  });
});
