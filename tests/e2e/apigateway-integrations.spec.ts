import type { Page } from "@playwright/test";
import {
  APIGatewayClient,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  PutIntegrationCommand,
  PutIntegrationResponseCommand,
  PutMethodCommand,
  PutMethodResponseCommand,
  type PutIntegrationCommandInput,
} from "@aws-sdk/client-api-gateway";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { strToU8, zipSync } from "fflate";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, test, uniqueName } from "./fixtures.ts";

// Trang API Gateway với service khác: hiện integration, gọi thử tới đích, đi sang trang của đích
test.describe.configure({ mode: "serial" });

const STAGE = "test";
const ACCOUNT_ID = "000000000000";
const FIRST_INVOKE_TIMEOUT_MS = 60_000;
const LOG_WAIT_MS = 60_000;
const QUEUE_WAIT_MS = 10_000;
const LOG_MARKER = "lc-e2e-apigw-log-marker";

let region: string;
let v1: APIGatewayClient;
let lambda: LambdaClient;
let sqs: SQSClient;
const apiIds: string[] = [];
const functions: string[] = [];
const queueUrls: string[] = [];

const lambdaUri = (name: string) =>
  `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${region}:${ACCOUNT_ID}:function:${name}/invocations`;

async function createFunction(source: string) {
  const name = uniqueName("apigw-fn");
  functions.push(name);
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: name,
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e`,
      Code: { ZipFile: zipSync({ "index.js": strToU8(source) }) },
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: name }));
    return Configuration?.State === "Active" ? true : undefined;
  });
  return name;
}

type Integration = Omit<PutIntegrationCommandInput, "restApiId" | "resourceId" | "httpMethod">;

// REST API: POST /<pathPart> với integration cho sẵn, có method / integration response 200 như CDK tạo
async function restApiWith(pathPart: string, integration: Integration) {
  const restApiId = (await v1.send(new CreateRestApiCommand({ name: uniqueName("apigw-int") })))
    .id!;
  apiIds.push(restApiId);
  const root = (await v1.send(new GetResourcesCommand({ restApiId }))).items![0].id!;
  const { id: resourceId } = await v1.send(
    new CreateResourceCommand({ restApiId, parentId: root, pathPart }),
  );
  const method = { restApiId, resourceId, httpMethod: "POST" };
  await v1.send(new PutMethodCommand({ ...method, authorizationType: "NONE" }));
  await v1.send(new PutIntegrationCommand({ ...method, ...integration }));
  await v1.send(new PutMethodResponseCommand({ ...method, statusCode: "200" }));
  await v1.send(
    new PutIntegrationResponseCommand({ ...method, statusCode: "200", selectionPattern: "" }),
  );
  await v1.send(new CreateDeploymentCommand({ restApiId, stageName: STAGE }));
  return restApiId;
}

const openMethod = async (page: Page, apiId: string, method: string) => {
  await page.goto(`/apigateway/v1/${apiId}`);
  await page.getByRole("button", { name: method, exact: true }).click();
  await expect(page.getByRole("heading", { name: method, exact: true })).toBeVisible();
};

const runTestWithBody = async (page: Page, body: string) => {
  await page.getByRole("tab", { name: "Test" }).click();
  await page.locator(".ace_text-input").focus();
  await page.keyboard.insertText(body);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText("Status 200")).toBeVisible({ timeout: FIRST_INVOKE_TIMEOUT_MS });
};

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  v1 = new APIGatewayClient(config);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
});

test.afterAll(async () => {
  for (const id of apiIds)
    await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
  for (const name of functions)
    await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
  for (const url of queueUrls)
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => {});
});

// Queue + REST API tích hợp SQS (path + template form), dùng cho hai test dưới
async function sqsIntegration() {
  const queueName = uniqueName("apigw-q");
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
  queueUrls.push(QueueUrl!);
  const uri = `arn:aws:apigateway:${region}:sqs:path/${ACCOUNT_ID}/${queueName}`;
  const apiId = await restApiWith("orders", {
    type: "AWS",
    integrationHttpMethod: "POST",
    uri,
    requestParameters: {
      "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'",
    },
    requestTemplates: {
      "application/json": "Action=SendMessage&MessageBody=$util.urlEncode($input.body)",
    },
  });
  return { apiId, uri, queueUrl: QueueUrl! };
}

const queuedBody = (queueUrl: string, timeoutMs?: number) =>
  waitFor(
    "the message in the queue",
    async () => {
      const { Messages } = await sqs.send(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
      );
      return Messages?.[0]?.Body;
    },
    { timeoutMs },
  );

test("an SQS integration shows AWS → sqs, and Test with a JSON content type queues the body", async ({
  page,
}) => {
  const { apiId, uri, queueUrl } = await sqsIntegration();

  await openMethod(page, apiId, "POST /orders");
  await expect(page.getByText("AWS → sqs")).toBeVisible();
  await expect(page.getByText(uri)).toBeVisible();
  await page.getByRole("tab", { name: "Test" }).click();
  await page.getByLabel("Headers", { exact: true }).fill("Content-Type: application/json");
  await runTestWithBody(page, '{"from":"console"}');

  expect(await queuedBody(queueUrl)).toBe('{"from":"console"}');
});

// B4 (tests/REPORT.md mục 16): không có Content-Type thì Floci, như AWS, coi body là application/json
test("Test without a Content-Type header queues the body like AWS does", async ({ page }) => {
  const { apiId, queueUrl } = await sqsIntegration();

  await openMethod(page, apiId, "POST /orders");
  await page.getByRole("tab", { name: "Test" }).click();
  await runTestWithBody(page, '{"from":"default"}');

  expect(await queuedBody(queueUrl, QUEUE_WAIT_MS)).toBe('{"from":"default"}');
});

test("a non-proxy Lambda integration links to the function page", async ({ page }) => {
  const fn = await createFunction("exports.handler = async (event) => ({ got: event });");
  const apiId = await restApiWith("plain", {
    type: "AWS",
    integrationHttpMethod: "POST",
    uri: lambdaUri(fn),
  });

  await openMethod(page, apiId, "POST /plain");
  await runTestWithBody(page, '{"x":1}');
  await expect(page.locator('[aria-label="Response body"]')).toContainText('"x": 1');

  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("link", { name: fn, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lambda/functions/${fn}$`));
  await expect(page.getByRole("heading", { level: 1, name: fn })).toBeVisible();
});

test("Lambda logs from the Test tab open Monitor with the invocation's log line", async ({
  page,
}) => {
  const fn = await createFunction(`exports.handler = async () => {
    console.log("${LOG_MARKER}");
    return { statusCode: 200, body: "logged" };
  };`);
  const apiId = await restApiWith("logged", {
    type: "AWS_PROXY",
    integrationHttpMethod: "POST",
    uri: lambdaUri(fn),
  });

  await openMethod(page, apiId, "POST /logged");
  await runTestWithBody(page, "{}");
  await page.getByRole("link", { name: `Lambda logs: ${fn} › Monitor` }).click();

  await expect(page).toHaveURL(new RegExp(`/lambda/functions/${fn}\\?tab=monitor$`));
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(LOG_MARKER).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: LOG_WAIT_MS });
});
