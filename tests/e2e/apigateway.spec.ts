import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { strToU8, zipSync } from "fflate";
import {
  APIGatewayClient,
  CreateAuthorizerCommand as CreateAuthorizerCommand1,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CFN_API_TYPES } from "../../core/src/services/apigateway/constants.ts";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import type { Page } from "@playwright/test";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

const restName = uniqueName("rest");
const httpName = uniqueName("http");
const wsName = uniqueName("ws");

test.describe.configure({ mode: "serial" });

let v1: APIGatewayClient;
let v2: ApiGatewayV2Client;
let restId: string;
const v2Ids: string[] = [];

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  v1 = new APIGatewayClient(config);
  v2 = new ApiGatewayV2Client(config);
  restId = (await v1.send(new CreateRestApiCommand({ name: restName }))).id!;
  v2Ids.push(
    (await v2.send(new CreateApiCommand({ Name: httpName, ProtocolType: "HTTP" }))).ApiId!,
    (
      await v2.send(
        new CreateApiCommand({
          Name: wsName,
          ProtocolType: "WEBSOCKET",
          RouteSelectionExpression: "$request.body.action",
        }),
      )
    ).ApiId!,
  );
});

test.afterAll(async () => {
  await v1.send(new DeleteRestApiCommand({ restApiId: restId })).catch(() => {});
  for (const id of v2Ids) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
});

test("lists APIs of all three types", async ({ page }) => {
  await page.goto("/apigateway");
  // Service chỉ có một mục điều hướng thì sidebar gộp thành một link mang tên service
  await expect(
    page
      .getByRole("navigation", { name: "Side navigation" })
      .getByRole("link", { name: "API Gateway", exact: true }),
  ).toHaveAttribute("href", "/apigateway/apis");
  const rowOf = (name: string) => page.getByRole("row").filter({ hasText: name });
  await expect(rowOf(restName).getByRole("cell", { name: "REST", exact: true })).toBeVisible();
  await expect(rowOf(httpName).getByRole("cell", { name: "HTTP", exact: true })).toBeVisible();
  await expect(rowOf(wsName).getByRole("cell", { name: "WebSocket", exact: true })).toBeVisible();
  await page.getByPlaceholder("Find APIs by name").fill(httpName);
  await expect(rowOf(httpName)).toHaveCount(1);
  await expect(rowOf(restName)).toHaveCount(0);
});

test("opens an API from the list", async ({ page }) => {
  await page.goto("/apigateway/apis");
  await page.getByRole("link", { name: restName }).click();
  await expect(page).toHaveURL(new RegExp(`/apigateway/v1/${restId}$`));
});

test("deletes an API", async ({ page }) => {
  await page.goto("/apigateway/apis");
  await page.getByRole("radio", { name: `Select API ${restName}` }).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("link", { name: restName })).toHaveCount(0);
  await expect(v1.send(new GetRestApiCommand({ restApiId: restId }))).rejects.toMatchObject({
    $metadata: { httpStatusCode: 404 },
  });
});

test("deletes an API from its detail page", async ({ page }) => {
  const name = uniqueName("detail-del");
  const id = (await v1.send(new CreateRestApiCommand({ name }))).id!;
  await page.goto(`/apigateway/v1/${id}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/apigateway\/apis$/);
  await expect(flash(page)).toContainText(`Deleted API ${name}`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await expect(v1.send(new GetRestApiCommand({ restApiId: id }))).rejects.toMatchObject({
    $metadata: { httpStatusCode: 404 },
  });
});

test.describe("detail page", () => {
  const fnName = uniqueName("get-item");
  const lambdaUri = (name: string) =>
    `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:${name}/invocations`;
  let detailId: string;
  let lambda: LambdaClient;

  test.beforeAll(async () => {
    const config = viaConsole((await consoleConfig()).region);
    lambda = new LambdaClient(config);
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: fnName,
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/lc-e2e",
        Code: {
          ZipFile: zipSync({ "index.js": strToU8("exports.handler=async()=>({statusCode:200})") }),
        },
      }),
    );
    detailId = (await v1.send(new CreateRestApiCommand({ name: uniqueName("detail") }))).id!;
    const root = (await v1.send(new GetResourcesCommand({ restApiId: detailId }))).items![0].id!;
    const make = async (parentId: string, pathPart: string) =>
      (await v1.send(new CreateResourceCommand({ restApiId: detailId, parentId, pathPart }))).id!;
    const items = await make(root, "items");
    const item = await make(items, "{id}");
    const health = await make(root, "health");
    const put = async (
      resourceId: string,
      authorizationType: string,
      type: string,
      uri?: string,
    ) => {
      await v1.send(
        new PutMethodCommand({
          restApiId: detailId,
          resourceId,
          httpMethod: "GET",
          authorizationType,
        }),
      );
      await v1.send(
        new PutIntegrationCommand({
          restApiId: detailId,
          resourceId,
          httpMethod: "GET",
          type,
          uri,
          integrationHttpMethod: uri ? "POST" : undefined,
        }),
      );
    };
    await put(items, "NONE", "AWS_PROXY", lambdaUri(fnName));
    await put(item, "AWS_IAM", "AWS_PROXY", lambdaUri(fnName));
    await put(health, "NONE", "MOCK");
  });

  test.afterAll(async () => {
    await v1.send(new DeleteRestApiCommand({ restApiId: detailId })).catch(() => {});
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })).catch(() => {});
  });

  test("shows the resource tree and method overview", async ({ page }) => {
    await page.goto(`/apigateway/v1/${detailId}`);
    await expect(page.getByRole("tab", { name: "Resources" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Authorizers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Stages" })).toBeVisible();
    await expect(page.getByText("/items", { exact: true })).toBeVisible();
    await expect(page.getByText("/items/{id}", { exact: true })).toBeVisible();
    await expect(page.getByText("/health", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "GET /items", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GET /items", exact: true })).toBeVisible();
    // Tiêu đề panel đã nói method, không lặp lại thành một dòng "Method"
    await expect(page.getByText("Method", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Lambda proxy →")).toBeVisible();
    await expect(page.getByRole("link", { name: fnName })).toHaveAttribute(
      "href",
      new RegExp(`/lambda/.*${fnName}`),
    );
    await expect(page.getByText("Not required")).toBeVisible();
    const noScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noScroll).toBe(true);
  });

  test("an AWS_IAM method says Floci checks only the signature", async ({ page }) => {
    await page.goto(`/apigateway/v1/${detailId}`);
    await page.getByRole("button", { name: "GET /items/{id}", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GET /items/{id}", exact: true })).toBeVisible();
    await expect(
      page.getByText("Floci checks the signature, not IAM policies. Test sends unsigned requests."),
    ).toBeVisible();
    await expect(page.getByText("AWS_IAM", { exact: false }).first()).toBeVisible();
  });
});

test.describe("unknown API", () => {
  test.use({ danglingProbes: true });

  test("an unknown API shows not found", async ({ page }) => {
    await page.goto("/apigateway/v1/nope");
    await expect(page.getByText("API nope not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "View APIs" })).toBeVisible();
    await page.goto("/apigateway/v9/x");
    await expect(page.getByText("API x not found")).toBeVisible();
  });
});

test.describe("API deleted while its page is open", () => {
  test.use({ danglingProbes: true });

  // Xóa ở nơi khác (CDK destroy, SDK) khi trang còn mở: tab đọc tiếp báo lỗi của Floci, trang không trắng;
  // mở lại trang thì báo not found như API không có
  test("the next tab shows Floci's error and a reload shows not found", async ({ page }) => {
    const name = uniqueName("gone");
    const id = (await v1.send(new CreateRestApiCommand({ name }))).id!;
    await page.goto(`/apigateway/v1/${id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await v1.send(new DeleteRestApiCommand({ restApiId: id }));
    await page.getByRole("tab", { name: "Stages" }).click();

    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`API ${id} not found`)).toBeVisible();
    await expect(page.getByRole("link", { name: "View APIs" })).toBeVisible();
  });
});

test.describe("routes and authorizers tabs", () => {
  const routesHttp = uniqueName("routes-http");
  const routesWs = uniqueName("routes-ws");
  const routesRest = uniqueName("auth-rest");
  let poolId: string;
  let poolArn: string;
  let cognito: CognitoIdentityProviderClient;
  let lambda: LambdaClient;
  const fnName = `${uniqueName("fn")}-token-auth`;
  let httpId: string;
  let wsId: string;
  let restAuthId: string;
  let issuer: string;
  const ids: string[] = [];

  test.beforeAll(async () => {
    const { flociInternalUrl, region } = await consoleConfig();
    cognito = new CognitoIdentityProviderClient(viaConsole(region));
    lambda = new LambdaClient(viaConsole(region));
    const pool = (await cognito.send(new CreateUserPoolCommand({ PoolName: uniqueName("pool") })))
      .UserPool!;
    poolId = pool.Id!;
    poolArn = pool.Arn!;
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: fnName,
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/lc-e2e",
        Code: {
          ZipFile: zipSync({ "index.js": strToU8("exports.handler=async()=>({})") }),
        },
      }),
    );
    issuer = `${flociInternalUrl}/${poolId}`;
    const api = await v2.send(new CreateApiCommand({ Name: routesHttp, ProtocolType: "HTTP" }));
    httpId = api.ApiId!;
    const integ = async (ApiId: string, IntegrationType: string, IntegrationUri: string) =>
      (
        await v2.send(
          new CreateIntegrationCommand({
            ApiId,
            IntegrationType,
            IntegrationUri,
            PayloadFormatVersion: "1.0",
            IntegrationMethod: "POST",
          }),
        )
      ).IntegrationId!;
    const lambdaIntegration = await integ(
      httpId,
      "AWS_PROXY",
      `arn:aws:lambda:us-east-1:000000000000:function:${fnName}`,
    );
    const proxyIntegration = await integ(httpId, "HTTP_PROXY", "https://example.com");
    const jwt = await v2.send(
      new CreateAuthorizerCommand({
        ApiId: httpId,
        Name: "jwt-auth",
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        JwtConfiguration: { Issuer: issuer, Audience: ["a"] },
      }),
    );
    const route = (RouteKey: string, target?: string, authorizerId?: string) =>
      v2.send(
        new CreateRouteCommand({
          ApiId: httpId,
          RouteKey,
          Target: target && `integrations/${target}`,
          AuthorizationType: authorizerId ? "JWT" : undefined,
          AuthorizerId: authorizerId,
        }),
      );
    await route("GET /items", lambdaIntegration, jwt.AuthorizerId);
    await route("ANY /proxy/{proxy+}", proxyIntegration);
    await route("$default", proxyIntegration);
    wsId = (
      await v2.send(
        new CreateApiCommand({
          Name: routesWs,
          ProtocolType: "WEBSOCKET",
          RouteSelectionExpression: "$request.body.action",
        }),
      )
    ).ApiId!;
    await v2.send(new CreateRouteCommand({ ApiId: wsId, RouteKey: "$connect" }));
    await v2.send(new CreateRouteCommand({ ApiId: wsId, RouteKey: "$default" }));
    ids.push(httpId, wsId);

    restAuthId = (await v1.send(new CreateRestApiCommand({ name: routesRest }))).id!;
    await v1.send(
      new CreateAuthorizerCommand1({
        restApiId: restAuthId,
        name: "cognito-auth",
        type: "COGNITO_USER_POOLS",
        providerARNs: [poolArn],
        identitySource: "method.request.header.Authorization",
      }),
    );
    await v1.send(
      new CreateAuthorizerCommand1({
        restApiId: restAuthId,
        name: "token-auth",
        type: "TOKEN",
        authorizerUri: `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:${fnName}/invocations`,
        identitySource: "method.request.header.Authorization",
      }),
    );
  });

  test.afterAll(async () => {
    await v1.send(new DeleteRestApiCommand({ restApiId: restAuthId })).catch(() => {});
    for (const id of ids) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })).catch(() => {});
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })).catch(() => {});
  });

  test("lists HTTP routes with integration and authorizer", async ({ page }) => {
    await page.goto(`/apigateway/v2/${httpId}`);
    const rowOf = (key: string) => page.getByRole("row").filter({ hasText: key });
    await expect(page.getByRole("heading", { name: "Routes (3)" })).toBeVisible();
    await expect(rowOf("GET /items").getByRole("link", { name: fnName })).toHaveAttribute(
      "href",
      new RegExp(`/lambda/.*${fnName}`),
    );
    await expect(rowOf("GET /items").getByText("jwt-auth")).toBeVisible();
    await expect(
      rowOf("ANY /proxy/{proxy+}").getByText("HTTP proxy → https://example.com"),
    ).toBeVisible();
    // Route không có authorizer hiện "—" thay cho NONE
    await expect(rowOf("$default").getByRole("cell", { name: "—", exact: true })).toBeVisible();
  });

  test("shows the WebSocket route selection", async ({ page }) => {
    await page.goto(`/apigateway/v2/${wsId}`);
    await expect(page.getByText("Route selection: $request.body.action")).toBeVisible();
  });

  test("REST authorizers link to the pool and the function", async ({ page }) => {
    await page.goto(`/apigateway/v1/${restAuthId}?tab=authorizers`);
    const rowOf = (name: string) => page.getByRole("row").filter({ hasText: name });
    await expect(page.getByRole("heading", { name: "Authorizers (2)" })).toBeVisible();
    await expect(rowOf("cognito-auth")).toContainText("Cognito user pools");
    await expect(rowOf("token-auth")).toContainText("Lambda (TOKEN)");
    await expect(rowOf("cognito-auth").getByRole("link", { name: poolId })).toHaveAttribute(
      "href",
      new RegExp(`/cognito/user-pools/${poolId}`),
    );
    await expect(rowOf("token-auth").getByRole("link", { name: fnName })).toHaveAttribute(
      "href",
      new RegExp(`/lambda/.*${fnName}`),
    );
  });

  test("a local JWT issuer has a popover", async ({ page }) => {
    await page.goto(`/apigateway/v2/${httpId}?tab=authorizers`);
    await page
      .getByRole("row")
      .filter({ hasText: "jwt-auth" })
      .getByRole("button", { name: `issuer ${issuer}` })
      .click();
    await expect(
      page.getByText(
        "Floci blocks local Cognito issuers, so requests get 401. Use a Lambda or Cognito user pool authorizer on a REST API to test sign-in locally.",
      ),
    ).toBeVisible();
  });
});

test.describe("stages tab", () => {
  const STAGES_DESCRIPTION =
    "Floci serves the latest configuration on every stage; deployments have no effect.";
  let stagesRestId: string;
  let stagesWsId: string;
  let stagesHttpId: string;

  test.beforeAll(async () => {
    stagesRestId = (await v1.send(new CreateRestApiCommand({ name: uniqueName("stages") }))).id!;
    const root = (await v1.send(new GetResourcesCommand({ restApiId: stagesRestId }))).items![0]
      .id!;
    await v1.send(
      new PutMethodCommand({
        restApiId: stagesRestId,
        resourceId: root,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );
    await v1.send(
      new PutIntegrationCommand({
        restApiId: stagesRestId,
        resourceId: root,
        httpMethod: "GET",
        type: "MOCK",
      }),
    );
    await v1.send(new CreateDeploymentCommand({ restApiId: stagesRestId, stageName: "dev" }));
    stagesHttpId = (
      await v2.send(new CreateApiCommand({ Name: uniqueName("stages-http"), ProtocolType: "HTTP" }))
    ).ApiId!;
    await v2.send(new CreateStageCommand({ ApiId: stagesHttpId, StageName: "$default" }));
    stagesWsId = (
      await v2.send(
        new CreateApiCommand({
          Name: uniqueName("stages-ws"),
          ProtocolType: "WEBSOCKET",
          RouteSelectionExpression: "$request.body.action",
        }),
      )
    ).ApiId!;
    await v2.send(new CreateStageCommand({ ApiId: stagesWsId, StageName: "dev" }));
  });

  test.afterAll(async () => {
    await v1.send(new DeleteRestApiCommand({ restApiId: stagesRestId })).catch(() => {});
    await v2.send(new DeleteApiCommand({ ApiId: stagesWsId })).catch(() => {});
    await v2.send(new DeleteApiCommand({ ApiId: stagesHttpId })).catch(() => {});
  });

  test("shows both invoke URLs for a REST stage", async ({ page }) => {
    const { flociInternalUrl } = await consoleConfig();
    await page.goto(`/apigateway/v1/${stagesRestId}?tab=stages`);
    await expect(page.getByText(STAGES_DESCRIPTION)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stages (1)" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Deployment" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Updated" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "dev" });
    await expect(row.getByText("From your machine")).toBeVisible();
    await expect(row.getByText("From a container in compose")).toBeVisible();
    // Ở dev hai URL trùng nhau (flociPublicUrl == flociInternalUrl), trong compose thì khác
    await expect(
      row.getByText(`http://localhost:4566/restapis/${stagesRestId}/dev/_user_request_/`).first(),
    ).toBeVisible();
    await expect(
      row.getByText(`${flociInternalUrl}/restapis/${stagesRestId}/dev/_user_request_/`).first(),
    ).toBeVisible();
    await expect(row.getByRole("button", { name: /restapis/ })).toHaveCount(2);
  });

  test("shows the invoke URL of an HTTP $default stage", async ({ page }) => {
    await page.goto(`/apigateway/v2/${stagesHttpId}?tab=stages`);
    const row = page.getByRole("row").filter({ hasText: "$default" });
    await expect(
      row
        .getByText(`http://localhost:4566/restapis/${stagesHttpId}/$default/_user_request_/`)
        .first(),
    ).toBeVisible();
  });

  test("shows WebSocket and @connections URLs", async ({ page }) => {
    await page.goto(`/apigateway/v2/${stagesWsId}?tab=stages`);
    const row = page.getByRole("row").filter({ hasText: "dev" });
    await expect(row.getByText("WebSocket URL")).toBeVisible();
    await expect(row.getByText("@connections URL")).toBeVisible();
    await expect(row.getByText(`ws://${stagesWsId}.execute-api.`, { exact: false })).toBeVisible();
    await expect(
      row.getByText(`/execute-api/${stagesWsId}/dev/@connections`, { exact: false }),
    ).toBeVisible();
  });
});

test.describe("Lambda triggers", () => {
  const ACCOUNT_ID = "000000000000";
  const policyFn = uniqueName("trig-policy");
  const bareFn = uniqueName("trig-bare");
  const goneFn = uniqueName("trig-gone");
  const restTriggerName = uniqueName("trig-rest");
  const httpTriggerName = uniqueName("trig-http");
  const goneName = uniqueName("trig-del");
  let lambda: LambdaClient;
  let region: string;
  let restTriggerId: string;
  let httpTriggerId: string;
  let goneId: string;

  const createFn = (name: string) =>
    lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e`,
        Code: { ZipFile: zipSync({ "index.js": strToU8("exports.handler=async()=>({})") }) },
      }),
    );
  const allow = (functionName: string, apiId: string, methodAndPath: string) =>
    lambda.send(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: `lc-e2e-${apiId}`,
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:${region}:${ACCOUNT_ID}:${apiId}/*/${methodAndPath}`,
      }),
    );

  test.beforeAll(async () => {
    const config = await consoleConfig();
    region = config.region;
    lambda = new LambdaClient(viaConsole(region));
    await Promise.all([createFn(policyFn), createFn(bareFn), createFn(goneFn)]);
    restTriggerId = (await v1.send(new CreateRestApiCommand({ name: restTriggerName }))).id!;
    httpTriggerId = (
      await v2.send(new CreateApiCommand({ Name: httpTriggerName, ProtocolType: "HTTP" }))
    ).ApiId!;
    goneId = (await v1.send(new CreateRestApiCommand({ name: goneName }))).id!;
    await allow(policyFn, restTriggerId, "GET/items/*");
    await allow(policyFn, httpTriggerId, "*/*");
    await allow(goneFn, goneId, "GET/items");
    await v1.send(new DeleteRestApiCommand({ restApiId: goneId }));
  });

  test.afterAll(async () => {
    await v1.send(new DeleteRestApiCommand({ restApiId: restTriggerId })).catch(() => {});
    await v1.send(new DeleteRestApiCommand({ restApiId: goneId })).catch(() => {});
    await v2.send(new DeleteApiCommand({ ApiId: httpTriggerId })).catch(() => {});
    for (const name of [policyFn, bareFn, goneFn])
      await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
  });

  test("shows API Gateway sources from the function policy", async ({ page }) => {
    await page.goto(`/lambda/functions/${policyFn}?tab=triggers`);
    const restRow = page.getByRole("row", { name: new RegExp(`API Gateway.*${restTriggerName}`) });
    const httpRow = page.getByRole("row", { name: new RegExp(`API Gateway.*${httpTriggerName}`) });
    await expect(restRow).toContainText("GET /items/*");
    await expect(restRow.getByRole("link", { name: restTriggerName })).toHaveAttribute(
      "href",
      `/apigateway/v1/${restTriggerId}`,
    );
    await expect(httpRow).toContainText("* /*");
    await expect(httpRow.getByRole("link", { name: httpTriggerName })).toHaveAttribute(
      "href",
      `/apigateway/v2/${httpTriggerId}`,
    );
    // Chỉ xem: sửa ở trang API Gateway
    await expect(restRow.getByRole("radio")).toBeDisabled();
    await expect(httpRow.getByRole("radio")).toBeDisabled();
  });

  test("a function without a policy shows no API Gateway row", async ({ page }) => {
    await page.goto(`/lambda/functions/${bareFn}?tab=triggers`);
    await expect(page.getByText("No triggers", { exact: false }).first()).toBeVisible();
    // Ô Source, không lọc theo tên dòng: câu empty state cũng nhắc "API Gateway routes"
    await expect(page.getByRole("cell", { name: "API Gateway", exact: true })).toHaveCount(0);
  });

  test("a deleted API stays as text", async ({ page }) => {
    await page.goto(`/lambda/functions/${goneFn}?tab=triggers`);
    const row = page.getByRole("row", { name: new RegExp(`API Gateway.*${goneId}`) });
    await expect(row).toContainText("GET /items");
    await expect(row.getByRole("link")).toHaveCount(0);
  });
});

test.describe("CloudFormation", () => {
  const stack = uniqueName("apigw-cfn");
  const restLogical = "Rest";
  const httpLogical = "Http";
  const cfnRestName = uniqueName("cfnrest");
  const cfnHttpName = uniqueName("cfnhttp");
  let cloudformation: CloudFormationClient;
  const physicalIds: Record<string, string> = {};

  test.beforeAll(async () => {
    cloudformation = new CloudFormationClient(viaConsole((await consoleConfig()).region));
    await cloudformation.send(
      new CreateStackCommand({
        StackName: stack,
        TemplateBody: JSON.stringify({
          AWSTemplateFormatVersion: "2010-09-09",
          Resources: {
            [restLogical]: { Type: CFN_API_TYPES.v1, Properties: { Name: cfnRestName } },
            [httpLogical]: {
              Type: CFN_API_TYPES.v2,
              Properties: { Name: cfnHttpName, ProtocolType: "HTTP" },
            },
          },
        }),
      }),
    );
    // Đợi hết *_IN_PROGRESS rồi mới đọc physical id
    await waitFor(`stack ${stack} to settle`, async () => {
      const { Stacks } = await cloudformation.send(new DescribeStacksCommand({ StackName: stack }));
      return Stacks?.[0]?.StackStatus?.endsWith("_IN_PROGRESS") ? undefined : Stacks?.[0];
    });
    const { StackResourceSummaries = [] } = await cloudformation.send(
      new ListStackResourcesCommand({ StackName: stack }),
    );
    for (const { LogicalResourceId, PhysicalResourceId } of StackResourceSummaries)
      if (LogicalResourceId && PhysicalResourceId)
        physicalIds[LogicalResourceId] = PhysicalResourceId;
  });

  test.afterAll(async () => {
    await cloudformation.send(new DeleteStackCommand({ StackName: stack })).catch(() => {});
  });

  for (const [logical, version, apiName] of [
    [restLogical, "v1", cfnRestName],
    [httpLogical, "v2", cfnHttpName],
  ]) {
    test(`${logical} resource links to its API page, which links back to the stack`, async ({
      page,
    }) => {
      await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
      const apiId = physicalIds[logical];
      expect(apiId).toBeTruthy();
      const row = page.getByRole("row", { name: new RegExp(`^${logical}\\b`) });
      await row.getByRole("link", { name: apiId, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/apigateway/${version}/${apiId}`));
      // Chờ trang API tải xong (lazy): breadcrumb của trang stack cũng mang tên stack
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(apiName);
      await page.getByRole("link", { name: stack, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stack}`));
    });
  }
});

test.describe("testing a REST method", () => {
  // Test 401 (thiếu token) và 404 (Lambda đã xóa) là cố ý
  test.use({ userRequestErrors: true });
  const STAGE = "test";
  const PASSWORD = "Passw0rd!Passw0rd!";
  const FIRST_INVOKE_TIMEOUT_MS = 60_000;
  const fnName = uniqueName("echo");
  const goneFn = uniqueName("gone");
  const ECHO_HANDLER = `exports.handler = async (event) => ({
    statusCode: 200,
    body: JSON.stringify({
      id: event.pathParameters && event.pathParameters.id,
      q: event.queryStringParameters && event.queryStringParameters.q,
      header: event.headers && event.headers["x-a"],
      body: event.body,
    }),
  });`;
  let lambda: LambdaClient;
  let cognito: CognitoIdentityProviderClient;
  let region: string;
  let poolId: string;
  let clientId: string;
  let username: string;
  let idToken: string;
  let testId: string;
  let goneId: string;
  let noStageId: string;
  const apiIds: string[] = [];

  const lambdaUri = (name: string) =>
    `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${region}:000000000000:function:${name}/invocations`;

  const createFunction = async (name: string) => {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/lc-e2e",
        Code: { ZipFile: zipSync({ "index.js": strToU8(ECHO_HANDLER) }) },
      }),
    );
  };

  const createApi = async () => {
    const id = (await v1.send(new CreateRestApiCommand({ name: uniqueName("tm") }))).id!;
    apiIds.push(id);
    const root = (await v1.send(new GetResourcesCommand({ restApiId: id }))).items![0].id!;
    return { id, root };
  };

  const addResource = async (restApiId: string, parentId: string, pathPart: string) =>
    (await v1.send(new CreateResourceCommand({ restApiId, parentId, pathPart }))).id!;

  const addLambdaMethod = async (
    restApiId: string,
    resourceId: string,
    httpMethod: string,
    fn: string,
    authorizerId?: string,
  ) => {
    await v1.send(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod,
        authorizationType: authorizerId ? "COGNITO_USER_POOLS" : "NONE",
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
        uri: lambdaUri(fn),
      }),
    );
  };

  test.beforeAll(async () => {
    region = (await consoleConfig()).region;
    lambda = new LambdaClient(viaConsole(region));
    cognito = new CognitoIdentityProviderClient(viaConsole(region));
    await createFunction(fnName);
    await createFunction(goneFn);

    // Pool + client + user thật: IdToken do Floci cấp, authorizer của API kiểm chữ ký
    const pool = (await cognito.send(new CreateUserPoolCommand({ PoolName: uniqueName("pool") })))
      .UserPool!;
    poolId = pool.Id!;
    clientId = (
      await cognito.send(
        new CreateUserPoolClientCommand({
          UserPoolId: poolId,
          ClientName: uniqueName("client"),
          ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
        }),
      )
    ).UserPoolClient!.ClientId!;
    username = uniqueName("user");
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
    idToken = (
      await cognito.send(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: username, PASSWORD },
        }),
      )
    ).AuthenticationResult!.IdToken!;

    // /items/{id} GET (Cognito) và /echo POST (không auth), cùng một Lambda
    const main = await createApi();
    testId = main.id;
    const authorizerId = (
      await v1.send(
        new CreateAuthorizerCommand1({
          restApiId: testId,
          name: "cognito-auth",
          type: "COGNITO_USER_POOLS",
          providerARNs: [pool.Arn!],
          identitySource: "method.request.header.Authorization",
        }),
      )
    ).id!;
    const items = await addResource(testId, main.root, "items");
    await addLambdaMethod(
      testId,
      await addResource(testId, items, "{id}"),
      "GET",
      fnName,
      authorizerId,
    );
    await addLambdaMethod(testId, await addResource(testId, main.root, "echo"), "POST", fnName);
    await v1.send(new CreateDeploymentCommand({ restApiId: testId, stageName: STAGE }));

    // Lambda bị xóa sau khi deploy
    const gone = await createApi();
    goneId = gone.id;
    await addLambdaMethod(goneId, await addResource(goneId, gone.root, "gone"), "GET", goneFn);
    await v1.send(new CreateDeploymentCommand({ restApiId: goneId, stageName: STAGE }));
    await lambda.send(new DeleteFunctionCommand({ FunctionName: goneFn }));

    // API có method nhưng chưa có stage
    const noStage = await createApi();
    noStageId = noStage.id;
    await addLambdaMethod(noStageId, noStage.root, "GET", fnName);
  });

  test.afterAll(async () => {
    for (const id of apiIds)
      await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
    for (const name of [fnName, goneFn])
      await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
    await cognito
      .send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: username }))
      .catch(() => {});
    await cognito
      .send(new DeleteUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }))
      .catch(() => {});
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })).catch(() => {});
  });

  const openTest = async (page: Page, apiId: string, method: string) => {
    await page.goto(`/apigateway/v1/${apiId}`);
    await page.getByRole("button", { name: method, exact: true }).click();
    await page.getByRole("tab", { name: "Test" }).click();
  };

  // CodeView mang aria-label do MethodTest đặt: tránh nhầm với ô Headers của form
  const responseBody = (page: Page) => page.locator('[aria-label="Response body"]');

  const runTest = (page: Page) => page.getByRole("button", { name: "Test", exact: true }).click();

  const writeBody = async (page: Page, text: string) => {
    await page.locator(".ace_text-input").focus();
    await page.keyboard.insertText(text);
  };

  test("tests a method with a path param", async ({ page }) => {
    await openTest(page, testId, "GET /items/{id}");
    await page.getByLabel("Path parameter: id").fill("42");
    await page.getByLabel("Headers", { exact: true }).fill(`Authorization: ${idToken}`);
    await runTest(page);

    await expect(page.getByText("Status 200")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
    await expect(page.getByText(/\d+ ms/)).toBeVisible();
    await expect(responseBody(page)).toContainText('"id": "42"');
    await expect(
      page.getByRole("link", { name: `Lambda logs: ${fnName} › Monitor` }),
    ).toHaveAttribute("href", `/lambda/functions/${fnName}?tab=monitor`);
  });

  test("sends query, headers and body", async ({ page }) => {
    await openTest(page, testId, "POST /echo");
    await page.getByLabel("Query string").fill("q=abc");
    await page.getByLabel("Headers", { exact: true }).fill("X-A:1");
    await writeBody(page, '{"a":1}');
    await runTest(page);

    await expect(page.getByText("Status 200")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
    await expect(responseBody(page)).toContainText('"q": "abc"');
    await expect(responseBody(page)).toContainText('"header": "1"');
    await expect(responseBody(page)).toContainText('"body": "{\\"a\\":1}"');
  });

  test("shows the body editor for POST and hides it for GET", async ({ page }) => {
    // Editor nạp lazy: phải thấy nó hiện ở POST thì kiểm "không có" ở GET mới có nghĩa
    await openTest(page, testId, "POST /echo");
    await expect(page.locator(".ace_text-input")).toHaveCount(1);

    await page.getByRole("button", { name: "GET /items/{id}", exact: true }).click();
    await expect(page.getByLabel("Path parameter: id")).toBeVisible();
    await expect(page.locator(".ace_text-input")).toHaveCount(0);
  });

  test("a Cognito method answers 401 without a token and 200 with one", async ({ page }) => {
    await openTest(page, testId, "GET /items/{id}");
    await page.getByLabel("Path parameter: id").fill("42");
    await runTest(page);
    await expect(page.getByText("Status 401")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });

    await page.getByLabel("Headers", { exact: true }).fill(`Authorization: ${idToken}`);
    await runTest(page);
    await expect(page.getByText("Status 200")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
  });

  test("bad header lines block the request", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("_user_request_")) sent.push(request.url());
    });
    await openTest(page, testId, "POST /echo");
    await page.getByLabel("Headers", { exact: true }).fill("broken");
    await runTest(page);

    await expect(page.getByText("Use Header:Value on each line.")).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("shows errors verbatim", async ({ page }) => {
    await openTest(page, goneId, "GET /gone");
    await runTest(page);

    await expect(page.getByText("Status 404")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
    await expect(responseBody(page)).toContainText(
      `Function not found: arn:aws:lambda:${region}:000000000000:function:${goneFn}`,
    );
  });

  test("an API without a stage cannot be tested", async ({ page }) => {
    await openTest(page, noStageId, "GET /");
    await expect(page.getByRole("button", { name: "Test", exact: true })).toBeDisabled();
    await expect(page.getByText("Create a stage to test this method.")).toBeVisible();
  });
});
