import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  ACCOUNT_ID,
  FUNCTION_TIMEOUT_SECONDS,
  consoleConfig,
  createTestFunction,
  viaConsole,
} from "../it/helpers.ts";
import { LAMBDA_ROLE, choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng đi xuyên các service trên UI: rule EventBridge → thêm state machine làm target → event tới →
// execution chạy Lambda → DynamoDB → SQS → từ bảng Steps bấm sang từng service và thấy dấu vết thật.

const names = {
  machine: uniqueName("flow-machine"),
  fn: uniqueName("flow-fn"),
  table: uniqueName("flow-table"),
  queue: uniqueName("flow-queue"),
  rule: uniqueName("flow-rule"),
};
const SOURCE = "lc.e2e.sfn.flow";
const ORDER_ID = "order-ui-7";

const HANDLER_SOURCE = `
export const handler = async (event) => ({ id: event.detail.id, label: "from-lambda" });`;

test.describe.configure({ mode: "serial" });

let sfn: SFNClient;
let lambda: LambdaClient;
let dynamodb: DynamoDBClient;
let sqs: SQSClient;
let events: EventBridgeClient;
let region: string;

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  sfn = new SFNClient(config);
  lambda = new LambdaClient(config);
  dynamodb = new DynamoDBClient(config);
  sqs = new SQSClient(config);
  events = new EventBridgeClient(config);

  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: names.queue }));
  await dynamodb.send(
    new CreateTableCommand({
      TableName: names.table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    }),
  );
  const { arn: functionArn } = await createTestFunction(lambda, {
    name: names.fn,
    source: HANDLER_SOURCE,
    role: LAMBDA_ROLE,
    timeout: FUNCTION_TIMEOUT_SECONDS,
  });
  await sfn.send(
    new CreateStateMachineCommand({
      name: names.machine,
      roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-sfn`,
      definition: JSON.stringify({
        StartAt: "Enrich",
        States: {
          Enrich: { Type: "Task", Resource: functionArn, Next: "Save" },
          Save: {
            Type: "Task",
            Resource: "arn:aws:states:::dynamodb:putItem",
            Parameters: {
              TableName: names.table,
              Item: { id: { "S.$": "$.id" }, label: { "S.$": "$.label" } },
            },
            ResultPath: null,
            Next: "Tell",
          },
          Tell: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage",
            Parameters: { QueueUrl, "MessageBody.$": "$.id" },
            End: true,
          },
        },
      }),
    }),
  );
  await events.send(
    new PutRuleCommand({ Name: names.rule, EventPattern: JSON.stringify({ source: [SOURCE] }) }),
  );
});

test.afterAll(async () => {
  await events
    .send(new RemoveTargetsCommand({ Rule: names.rule, Ids: [`stepfunctions-${names.machine}`] }))
    .catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: names.rule })).catch(() => {});
  await sfn
    .send(
      new DeleteStateMachineCommand({
        stateMachineArn: `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${names.machine}`,
      }),
    )
    .catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: names.fn })).catch(() => {});
  await dynamodb.send(new DeleteTableCommand({ TableName: names.table })).catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: names.queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

test("an event on the rule runs the state machine, and each step links to the service it used", async ({
  page,
}) => {
  // 1. Gắn state machine vào rule bằng UI
  await page.goto(`/eventbridge/rules/default/${names.rule}`);
  await page.getByRole("button", { name: "Add target" }).first().click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /Type/, { name: "Step Functions" });
  await choose(page, dialog, /Choose a resource|Step Functions/, { name: names.machine });
  await dialog.getByRole("button", { name: "Add target" }).click();
  await expect(flash(page)).toContainText("Added target");

  // 2. Event tới rule → execution chạy
  await events.send(
    new PutEventsCommand({
      Entries: [
        { Source: SOURCE, DetailType: "OrderCreated", Detail: JSON.stringify({ id: ORDER_ID }) },
      ],
    }),
  );

  // 3. Từ target của rule sang state machine, mở execution vừa chạy
  await page.getByRole("link", { name: names.machine }).click();
  await expect(page.getByRole("heading", { level: 1, name: names.machine })).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).first().click();
    await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("table").getByRole("link").first().click();

  // 4. Bảng Steps: ba bước, mỗi bước link tới service nó đã gọi
  for (const step of ["Enrich", "Save", "Tell"]) {
    await expect(page.getByRole("link", { name: step, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Succeeded", { exact: true })).toHaveCount(4);
  const executionUrl = page.url();

  // 5. Link DynamoDB → bảng, mục do state machine ghi
  await page.getByRole("link", { name: names.table }).click();
  await expect(page.getByRole("heading", { level: 1, name: names.table })).toBeVisible();
  await expect(page.getByText(ORDER_ID).first()).toBeVisible();

  // 6. Link SQS → queue có message do bước Tell gửi
  await page.goto(executionUrl);
  await page.getByRole("link", { name: names.queue }).click();
  await expect(page.getByRole("heading", { level: 1, name: names.queue })).toBeVisible();
  await expect(page.getByText(ORDER_ID).first()).toBeVisible();

  // 7. Link Lambda → trang function
  await page.goto(executionUrl);
  await page.getByRole("link", { name: names.fn }).click();
  await expect(page.getByRole("heading", { level: 1, name: names.fn })).toBeVisible();
});
