import type { APIRequestContext, Page } from "@playwright/test";
import {
  APIGatewayClient,
  CreateAuthorizerCommand,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  DeleteApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { strToU8, zipSync } from "fflate";
import { testInvokeUrl, webSocketUrl } from "../../core/src/services/apigateway/invokeUrl.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../../core/src/services/lambda/paths.ts";
import { AWS_PROXY_PATH } from "../../web/src/shared/constants.ts";
import { ACCOUNT_ID, CONSOLE_URL, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, test, uniqueName } from "./fixtures.ts";

// Tạo / sửa / xóa API Gateway trên console (spec 2026-11-27-apigateway-crud)
test.describe.configure({ mode: "serial" });

const API_URL = /\/apigateway\/(v1|v2)\/([^/?]+)/;
const FIRST_INVOKE_TIMEOUT_MS = 60_000;
const LOCKED_INTEGRATION =
  "Edit this integration in your IaC: the console edits Lambda and HTTP proxy integrations.";

let region: string;
let publicUrl: string;
let v1: APIGatewayClient;
let v2: ApiGatewayV2Client;
let lambda: LambdaClient;
const restIds: string[] = [];
const v2Ids: string[] = [];
const functions: string[] = [];

async function createFunction(source: string) {
  const name = uniqueName("apigw-crud-fn");
  functions.push(name);
  const { FunctionArn } = await lambda.send(
    new CreateFunctionCommand({
      FunctionName: name,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e`,
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

// Ghi lại API vừa tạo trên UI (đọc từ URL trang chi tiết) để afterAll dọn
async function createdApi(page: Page) {
  await expect(page).toHaveURL(API_URL);
  const [, version, apiId] = API_URL.exec(page.url()) ?? [];
  (version === "v1" ? restIds : v2Ids).push(apiId);
  return apiId;
}

async function createApiOnPage(page: Page, type: string, name: string, functionName?: string) {
  await page.goto("/apigateway/apis");
  await page.getByRole("link", { name: "Create API" }).click();
  await expect(page).toHaveURL(/\/apigateway\/apis\/create$/);
  await page.getByRole("radio", { name: new RegExp(`^${type}`) }).check();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  if (functionName) {
    await choose(page, page.locator("form"), /Lambda function/, { name: functionName });
  }
  await page.getByRole("button", { name: "Create API" }).click();
  return createdApi(page);
}

async function restApi() {
  const { id = "" } = await v1.send(
    new CreateRestApiCommand({ name: uniqueName("apigw-crud-sdk") }),
  );
  restIds.push(id);
  return id;
}

test.beforeAll(async () => {
  ({ region, flociPublicUrl: publicUrl } = await consoleConfig());
  const config = viaConsole(region);
  v1 = new APIGatewayClient(config);
  v2 = new ApiGatewayV2Client(config);
  lambda = new LambdaClient(config);
});

test.afterAll(async () => {
  for (const id of restIds)
    await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
  for (const id of v2Ids) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
  for (const name of functions)
    await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
});

test("creates an HTTP API with a Lambda, calls it, and Lambda › Triggers lists it", async ({
  page,
  request,
}) => {
  const fn = await replying("from-console");
  const name = uniqueName("apigw-crud-http");
  const apiId = await createApiOnPage(page, "HTTP", name, fn.name);

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "$default", exact: true })).toBeVisible();
  const response = await request.get(
    `${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, "$default", "/x", "")}`,
  );
  expect(await response.text()).toBe("from-console");

  await page.goto(lambdaRoutes.function(fn.name, FUNCTION_TABS.triggers));
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});

test("creates REST and WebSocket APIs", async ({ page }) => {
  const rest = uniqueName("apigw-crud-rest");
  await createApiOnPage(page, "REST", rest);
  await expect(page.getByRole("heading", { level: 1, name: rest })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();

  const ws = uniqueName("apigw-crud-ws");
  await createApiOnPage(page, "WebSocket", ws);
  await expect(page.getByRole("heading", { level: 1, name: ws })).toBeVisible();
  await expect(page.getByText("Route selection: $request.body.action")).toBeVisible();
});

test("blocks a WebSocket API without a route selection expression", async ({ page }) => {
  await page.goto("/apigateway/apis/create");
  await page.getByRole("radio", { name: /^WebSocket/ }).check();
  await page.getByRole("textbox", { name: "Name" }).fill(uniqueName("apigw-crud-ws"));
  await page.getByRole("textbox", { name: "Route selection expression" }).fill("");
  await page.getByRole("button", { name: "Create API" }).click();
  await expect(page.getByText("Enter a route selection expression.")).toBeVisible();
  await expect(page).toHaveURL(/\/apigateway\/apis\/create$/);
});

test("edits an API name", async ({ page }) => {
  await createApiOnPage(page, "REST", uniqueName("apigw-crud-edit"));
  const renamed = uniqueName("apigw-crud-renamed");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit API" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(renamed);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
});

test("creates and deletes a stage", async ({ page }) => {
  const apiId = await restApi();
  await page.goto(`/apigateway/v1/${apiId}?tab=stages`);

  await page.getByRole("button", { name: "Create stage" }).click();
  let dialog = page.getByRole("dialog", { name: "Create stage" });
  await dialog.getByRole("textbox", { name: "Stage name" }).fill("dev");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "dev", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create stage" }).click();
  dialog = page.getByRole("dialog", { name: "Create stage" });
  await dialog.getByRole("textbox", { name: "Stage name" }).fill("dev");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByText("Stage dev already exists.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("radio", { name: "Select stage dev" }).check();
  await page
    .getByRole("tabpanel", { name: "Stages" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete stage dev?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("No stages")).toBeVisible();
});

const resourcesPanel = (page: Page) => page.getByRole("tabpanel", { name: "Resources" });

// Chọn resource / method trên cây (nút mang aria-label là path, hoặc "METHOD path")
const pick = (page: Page, label: string) =>
  resourcesPanel(page).getByRole("button", { name: label, exact: true }).click();

async function createResourceOnPage(page: Page, pathPart: string) {
  await resourcesPanel(page).getByRole("button", { name: "Create resource" }).click();
  const dialog = page.getByRole("dialog", { name: "Create resource" });
  await dialog.getByRole("textbox", { name: "Path part" }).fill(pathPart);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function testMethod(page: Page, label: string, status: string) {
  await pick(page, label);
  await page.getByRole("tab", { name: "Test" }).click();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText(`Status ${status}`)).toBeVisible({
    timeout: FIRST_INVOKE_TIMEOUT_MS,
  });
}

const responseBody = (page: Page) => page.locator('[aria-label="Response body"]');

test.describe("REST resources and methods", () => {
  let first: { name: string; arn: string };
  let second: { name: string; arn: string };

  test.beforeAll(async () => {
    [first, second] = [await replying("first-fn"), await replying("second-fn")];
  });

  test("builds a REST API from the console and tests it", async ({ page }) => {
    const apiId = await createApiOnPage(page, "REST", uniqueName("apigw-crud-build"));
    await createResourceOnPage(page, "items");
    await pick(page, "/items");
    await resourcesPanel(page).getByRole("button", { name: "Create method" }).click();
    const dialog = page.getByRole("dialog", { name: "Create method" });
    await choose(page, dialog, /Lambda function/, { name: first.name });
    await expect(
      dialog.getByRole("checkbox", { name: /Grant API Gateway permission/ }),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.goto(`/apigateway/v1/${apiId}?tab=stages`);
    await page.getByRole("button", { name: "Create stage" }).click();
    const stage = page.getByRole("dialog", { name: "Create stage" });
    await stage.getByRole("textbox", { name: "Stage name" }).fill("test");
    await stage.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: "test", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Resources" }).click();
    await testMethod(page, "GET /items", "200");
    await expect(responseBody(page)).toContainText("first-fn");

    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).last().click();
    const edit = page.getByRole("dialog", { name: "Edit method" });
    await choose(page, edit, /Lambda function/, { name: second.name });
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await page.getByRole("tab", { name: "Test" }).click();
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(responseBody(page)).toContainText("second-fn");

    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await page
      .getByRole("dialog", { name: "Delete method GET /items?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(resourcesPanel(page).getByRole("button", { name: "GET /items" })).toBeHidden();

    await pick(page, "/items");
    await resourcesPanel(page).getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Delete resource /items?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(resourcesPanel(page).getByRole("button", { name: "/items" })).toBeHidden();
  });

  test("locks Delete on a resource with children and Create resource under {proxy+}", async ({
    page,
  }) => {
    await createApiOnPage(page, "REST", uniqueName("apigw-crud-locks"));
    await createResourceOnPage(page, "items");
    await pick(page, "/items");
    await createResourceOnPage(page, "{id}");
    await pick(page, "/items");
    await expect(
      resourcesPanel(page).getByRole("button", { name: "Delete", exact: true }),
    ).toBeDisabled();

    await pick(page, "/");
    await createResourceOnPage(page, "{proxy+}");
    await pick(page, "/{proxy+}");
    await expect(
      resourcesPanel(page).getByRole("button", { name: "Create resource" }),
    ).toBeDisabled();

    await pick(page, "/");
    await resourcesPanel(page).getByRole("button", { name: "Create resource" }).click();
    const dialog = page.getByRole("dialog", { name: "Create resource" });
    await dialog.getByRole("textbox", { name: "Path part" }).fill("items");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog.getByText("A resource /items already exists.")).toBeVisible();
  });

  test("locks the integration of a CDK-made AWS integration", async ({ page }) => {
    const apiId = await restApi();
    const root = (await v1.send(new GetResourcesCommand({ restApiId: apiId }))).items![0].id!;
    const { id: resourceId } = await v1.send(
      new CreateResourceCommand({ restApiId: apiId, parentId: root, pathPart: "queue" }),
    );
    const method = { restApiId: apiId, resourceId, httpMethod: "POST" };
    await v1.send(new PutMethodCommand({ ...method, authorizationType: "NONE" }));
    await v1.send(
      new PutIntegrationCommand({
        ...method,
        type: "AWS",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${region}:sqs:path/${ACCOUNT_ID}/lc-e2e-missing`,
      }),
    );

    await page.goto(`/apigateway/v1/${apiId}`);
    await pick(page, "POST /queue");
    await page.getByRole("button", { name: "Edit", exact: true }).last().click();
    const dialog = page.getByRole("dialog", { name: "Edit method" });
    await expect(dialog.getByText(LOCKED_INTEGRATION)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Lambda function/ })).toHaveCount(0);
  });
});

const invoke = (request: APIRequestContext, apiId: string, path: string) =>
  request.get(`${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, "$default", path, "")}`);

const routesPanel = (page: Page) => page.getByRole("tabpanel", { name: "Routes" });

test.describe("routes", () => {
  test("creates, edits and deletes an HTTP route", async ({ page, request }) => {
    const fn = await replying("from-http-route");
    const apiId = await createApiOnPage(page, "HTTP", uniqueName("apigw-crud-routes"));

    await routesPanel(page).getByRole("button", { name: "Create route" }).click();
    let dialog = page.getByRole("dialog", { name: "Create route" });
    await dialog.getByRole("textbox", { name: "Path" }).fill("/items/{id}");
    await choose(page, dialog, /Lambda function/, { name: fn.name });
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: "GET /items/{id}" })).toBeVisible();
    expect(await (await invoke(request, apiId, "/items/7")).text()).toBe("from-http-route");

    await page.getByRole("radio", { name: "Select route GET /items/{id}" }).check();
    await routesPanel(page).getByRole("button", { name: "Edit", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Edit route" });
    await dialog.getByRole("textbox", { name: "Path" }).fill("/things/{id}");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("rowheader", { name: "GET /things/{id}" })).toBeVisible();
    expect(await (await invoke(request, apiId, "/things/7")).text()).toBe("from-http-route");
    expect((await invoke(request, apiId, "/items/7")).status()).toBe(404);

    await routesPanel(page).getByRole("button", { name: "Create route" }).click();
    dialog = page.getByRole("dialog", { name: "Create route" });
    await dialog.getByRole("textbox", { name: "Path" }).fill("/things/{id}");
    await choose(page, dialog, /Lambda function/, { name: fn.name });
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog.getByText("Route GET /things/{id} already exists.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("radio", { name: "Select route GET /things/{id}" }).check();
    await routesPanel(page).getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Delete route GET /things/{id}?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("No routes")).toBeVisible();
  });

  // Route WebSocket do IaC trỏ tới HTTP backend: integration khóa, sửa phần khác vẫn lưu được
  test("saves a WebSocket route whose integration the console doesn't edit", async ({ page }) => {
    const { ApiId = "" } = await v2.send(
      new CreateApiCommand({
        Name: uniqueName("apigw-crud-ws-http"),
        ProtocolType: "WEBSOCKET",
        RouteSelectionExpression: "$request.body.action",
      }),
    );
    v2Ids.push(ApiId);
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({
        ApiId,
        IntegrationType: "HTTP_PROXY",
        IntegrationMethod: "POST",
        IntegrationUri: "http://console:3701/api/health",
      }),
    );
    await v2.send(
      new CreateRouteCommand({
        ApiId,
        RouteKey: "$default",
        Target: `integrations/${IntegrationId}`,
      }),
    );

    await page.goto(`/apigateway/v2/${ApiId}`);
    await page.getByRole("radio", { name: "Select route $default" }).check();
    await routesPanel(page).getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit route" });
    await expect(dialog.getByText(LOCKED_INTEGRATION)).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a two-way WebSocket route replies", async ({ page }) => {
    const fn = await replying("pong");
    const apiId = await createApiOnPage(page, "WebSocket", uniqueName("apigw-crud-ws-route"));

    await routesPanel(page).getByRole("button", { name: "Create route" }).click();
    const dialog = page.getByRole("dialog", { name: "Create route" });
    await dialog.getByRole("combobox", { name: "Route key" }).fill("$default");
    await choose(page, dialog, /Lambda function/, { name: fn.name });
    await expect(
      dialog.getByRole("checkbox", { name: /Send the function's response/ }),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: "$default" })).toBeVisible();

    await page.getByRole("tab", { name: "Stages" }).click();
    await page.getByRole("button", { name: "Create stage" }).click();
    const stage = page.getByRole("dialog", { name: "Create stage" });
    await stage.getByRole("textbox", { name: "Stage name" }).fill("dev");
    await stage.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: "dev", exact: true })).toBeVisible();

    const socket = new WebSocket(webSocketUrl(publicUrl, region, apiId, "dev"));
    const received: string[] = [];
    socket.addEventListener("message", (event) => received.push(String(event.data)));
    try {
      await waitFor("socket open", async () =>
        socket.readyState === WebSocket.OPEN ? true : undefined,
      );
      socket.send(JSON.stringify({ action: "ping" }));
      expect(await waitFor("the reply", async () => received[0])).toBe("pong");
    } finally {
      socket.close();
    }
  });
});

const authorizersPanel = (page: Page) => page.getByRole("tabpanel", { name: "Authorizers" });

async function createAuthorizerOnPage(
  page: Page,
  name: string,
  fill: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>,
) {
  await authorizersPanel(page).getByRole("button", { name: "Create authorizer" }).click();
  const dialog = page.getByRole("dialog", { name: "Create authorizer" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await fill(dialog);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("rowheader", { name, exact: true })).toBeVisible();
}

test.describe("authorizers", () => {
  // Tab Test cố ý gọi method thiếu token (401)
  test.use({ userRequestErrors: true });

  test("a TOKEN authorizer from the console guards a method", async ({ page }) => {
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
    const backend = await replying("guarded-inside");
    const apiId = await restApi();
    const root = (await v1.send(new GetResourcesCommand({ restApiId: apiId }))).items![0].id!;
    const { id: resourceId } = await v1.send(
      new CreateResourceCommand({ restApiId: apiId, parentId: root, pathPart: "guarded" }),
    );
    const method = { restApiId: apiId, resourceId, httpMethod: "GET" };
    await v1.send(new PutMethodCommand({ ...method, authorizationType: "NONE" }));
    await v1.send(
      new PutIntegrationCommand({
        ...method,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${backend.arn}/invocations`,
      }),
    );
    await v1.send(new CreateDeploymentCommand({ restApiId: apiId, stageName: "test" }));

    await page.goto(`/apigateway/v1/${apiId}?tab=authorizers`);
    await createAuthorizerOnPage(page, "token-auth", (dialog) =>
      choose(page, dialog, /Lambda function/, { name: authorizer.name }),
    );

    await page.getByRole("tab", { name: "Resources" }).click();
    await pick(page, "GET /guarded");
    await page.getByRole("button", { name: "Edit", exact: true }).last().click();
    const edit = page.getByRole("dialog", { name: "Edit method" });
    await choose(page, edit, /Authorization/, { name: /token-auth/ });
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();

    await testMethod(page, "GET /guarded", "401");
    await page.getByLabel("Headers", { exact: true }).fill("Authorization: allow");
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(page.getByText("Status 200")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
  });

  test("edits and deletes an authorizer", async ({ page }) => {
    const fn = await replying("unused");
    const apiId = await restApi();
    await page.goto(`/apigateway/v1/${apiId}?tab=authorizers`);
    await createAuthorizerOnPage(page, "first-name", (dialog) =>
      choose(page, dialog, /Lambda function/, { name: fn.name }),
    );

    await page.getByRole("radio", { name: "Select authorizer first-name" }).check();
    await authorizersPanel(page).getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit authorizer" });
    await edit.getByRole("textbox", { name: "Name" }).fill("second-name");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("rowheader", { name: "second-name", exact: true })).toBeVisible();

    await authorizersPanel(page).getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Delete authorizer second-name?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("No authorizers")).toBeVisible();
  });

  // CDK RequestAuthorizer với IdentitySource.queryString: sửa xong phải lưu được
  test("edits a REQUEST authorizer that reads a query string", async ({ page }) => {
    const fn = await replying("unused-query");
    const apiId = await restApi();
    await v1.send(
      new CreateAuthorizerCommand({
        restApiId: apiId,
        name: "query-auth",
        type: "REQUEST",
        authorizerUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${fn.arn}/invocations`,
        identitySource: "method.request.querystring.token",
      }),
    );

    await page.goto(`/apigateway/v1/${apiId}?tab=authorizers`);
    await page.getByRole("radio", { name: "Select authorizer query-auth" }).check();
    await authorizersPanel(page).getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit authorizer" });
    await expect(edit.getByRole("radio", { name: "Query string" })).toBeChecked();
    await edit.getByRole("textbox", { name: "Name" }).fill("query-renamed");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole("rowheader", { name: "query-renamed", exact: true })).toBeVisible();
  });

  test("a JWT authorizer with a local issuer keeps the warning", async ({ page }) => {
    const { ApiId = "" } = await v2.send(
      new CreateApiCommand({ Name: uniqueName("apigw-crud-jwt"), ProtocolType: "HTTP" }),
    );
    v2Ids.push(ApiId);
    const issuer = `${publicUrl}/${region}_local`;

    await page.goto(`/apigateway/v2/${ApiId}?tab=authorizers`);
    await createAuthorizerOnPage(page, "jwt-auth", async (dialog) => {
      await choose(page, dialog, /Type/, { name: "JWT", exact: true });
      await dialog.getByRole("textbox", { name: "Issuer" }).fill(issuer);
      await dialog.getByRole("textbox", { name: /Audience/ }).fill("my-client");
    });
    await expect(page.getByText(`issuer ${issuer}`)).toBeVisible();
  });
});
