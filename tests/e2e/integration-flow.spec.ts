import { strToU8, zipSync } from "fflate";
import type { Page } from "@playwright/test";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  DeleteFunctionEventInvokeConfigCommand,
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  DeleteConfigurationSetCommand,
  DeleteEmailIdentityCommand,
  SendEmailCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, deleteMails, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng nối service, cấu hình bằng UI rồi kích bằng SDK và đọc kết quả ở service nhận:
//  1. SQS queue → Lambda có filter pattern (message không khớp bị bỏ)
//  2. Lambda async On success → SNS topic → queue
//  3. DynamoDB stream → Lambda lỗi → On failure queue
//  4. SES configuration set → SNS topic → queue, mail gửi qua identity có set mặc định

const fn = uniqueName("fn");
const sourceQueue = uniqueName("src");
const topic = uniqueName("topic");
const topicQueue = uniqueName("topic-q");
const failureQueue = uniqueName("fail-q");
const sesTopic = uniqueName("ses-topic");
const sesQueue = uniqueName("ses-q");
const busQueue = uniqueName("bus-q");
const busRule = uniqueName("bus-rule");
const DEFAULT_BUS = "default";
const table = uniqueName("tbl");
const configurationSet = uniqueName("set");
const sender = `${uniqueName("sender")}@example.com`;
const MARKER = "LC_E2E_FLOW";
const SIMULATOR_SUCCESS = "success@simulator.amazonses.com";

test.describe.configure({ mode: "serial" });

let lambda: LambdaClient;
let sqs: SQSClient;
let sns: SNSClient;
let ses: SESv2Client;
let dynamodb: DynamoDBClient;
let events: EventBridgeClient;
let region = "";
const queueUrls: Record<string, string> = {};
const queueArns: Record<string, string> = {};
const topicArns: string[] = [];

// Lỗi với bản ghi stream hoặc event có fail=true; các lần khác ghi log kèm MARKER
const HANDLER = `
export const handler = async (event) => {
  if (event.fail || event.Records?.[0]?.eventSource === "aws:dynamodb") throw new Error("flow boom");
  for (const record of event.Records ?? []) console.log("${MARKER}", record.body);
  return { ok: true };
};`;

const makeQueue = async (name: string) => {
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  queueUrls[name] = QueueUrl!;
  queueArns[name] = (
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }))
  ).Attributes!.QueueArn!;
};

const makeTopicInto = async (name: string, queue: string) => {
  const arn = (await sns.send(new CreateTopicCommand({ Name: name }))).TopicArn!;
  topicArns.push(arn);
  await sns.send(
    new SubscribeCommand({ TopicArn: arn, Protocol: "sqs", Endpoint: queueArns[queue] }),
  );
};

const bodiesOf = async (queue: string) =>
  (
    (
      await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrls[queue],
          WaitTimeSeconds: 1,
          MaxNumberOfMessages: 10,
        }),
      )
    ).Messages ?? []
  ).map((message) => message.Body ?? "");

const waitForQueue = (description: string, queue: string) =>
  waitFor(description, async () => {
    const found = await bodiesOf(queue);
    return found.length ? found.join("\n") : undefined;
  });

// Ace tự đóng ngoặc khi gõ nên đặt giá trị qua instance của editor
async function setEditor(page: Page, index: number, text: string) {
  await page
    .locator(".ace_editor")
    .nth(index)
    .evaluate((element, value) => {
      (
        element as unknown as { env: { editor: { setValue(text: string): void } } }
      ).env.editor.setValue(value);
    }, text);
}

test.beforeAll(async () => {
  region = (await consoleConfig()).region;
  const config = viaConsole(region);
  events = new EventBridgeClient(config);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  ses = new SESv2Client(config);
  dynamodb = new DynamoDBClient(config);

  for (const name of [sourceQueue, topicQueue, failureQueue, sesQueue, busQueue])
    await makeQueue(name);
  await makeTopicInto(topic, topicQueue);
  await makeTopicInto(sesTopic, sesQueue);
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: fn,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-lambda`,
      Code: { ZipFile: zipSync({ "index.mjs": strToU8(HANDLER) }) },
      Timeout: 30,
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: fn }));
    return Configuration?.State === "Active" ? true : undefined;
  });
  await dynamodb.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
    }),
  );
  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
});

test.afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  await quiet(
    events.send(
      new RemoveTargetsCommand({ Rule: busRule, EventBusName: DEFAULT_BUS, Ids: ["queue"] }),
    ),
  );
  await quiet(events.send(new DeleteRuleCommand({ Name: busRule, EventBusName: DEFAULT_BUS })));
  const { EventSourceMappings = [] } = await lambda.send(
    new ListEventSourceMappingsCommand({ FunctionName: fn }),
  );
  for (const { UUID } of EventSourceMappings)
    await quiet(lambda.send(new DeleteEventSourceMappingCommand({ UUID })));
  await quiet(lambda.send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: fn })));
  await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName: fn })));
  await quiet(dynamodb.send(new DeleteTableCommand({ TableName: table })));
  await quiet(ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: sender })));
  await quiet(
    ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: configurationSet })),
  );
  await deleteMails((mail) => mail.Source === sender);
  for (const TopicArn of topicArns) await quiet(sns.send(new DeleteTopicCommand({ TopicArn })));
  for (const QueueUrl of Object.values(queueUrls))
    await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl })));
});

test("queue trigger with a filter pattern only runs the function for matching messages", async ({
  page,
}) => {
  await page.goto(`/sqs/queues/${sourceQueue}`);
  await page.getByRole("tab", { name: "Lambda triggers" }).click();
  await page.getByRole("button", { name: "Add trigger" }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /^Function/, { name: new RegExp(fn) });
  await dialog.getByRole("button", { name: "Add pattern" }).click();
  await setEditor(page, 0, '{"body": {"type": ["order"]}}');
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(flash(page).getByText(`${fn} now runs when messages arrive`)).toBeVisible();

  for (const type of ["spam", "order"])
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrls[sourceQueue],
        MessageBody: JSON.stringify({ type, marker: `${MARKER}-${type}` }),
      }),
    );

  await page.goto(`/lambda/functions/${fn}?tab=monitor`);
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(`${MARKER}-order`).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByText(`${MARKER}-spam`)).toHaveCount(0);

  // Gỡ trigger để các luồng sau không bị message của queue này chạy lẫn vào
  const { EventSourceMappings = [] } = await lambda.send(
    new ListEventSourceMappingsCommand({ FunctionName: fn }),
  );
  for (const { UUID } of EventSourceMappings)
    await lambda.send(new DeleteEventSourceMappingCommand({ UUID }));
});

test("Lambda async On success sends the result to an SNS topic, then the queue", async ({
  page,
}) => {
  await page.goto(`/lambda/functions/${fn}?tab=configuration`);
  await page.getByRole("button", { name: "Edit" }).last().click();
  const dialog = page.getByRole("dialog", { name: /asynchronous invocation/i });
  await dialog.getByLabel("Retry attempts").fill("0");
  await choose(page, dialog, /On success/, { name: "SNS topic", exact: true });
  await dialog
    .getByRole("button", { name: /^SNS topic/ })
    .last()
    .click();
  await page.getByRole("option", { name: topic, exact: true }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(/Updated asynchronous invocation/)).toBeVisible();
  await expect(page.getByRole("link", { name: topic })).toBeVisible();

  await lambda.send(
    new InvokeCommand({
      FunctionName: fn,
      InvocationType: "Event",
      Payload: strToU8(JSON.stringify({ ok: 1 })),
    }),
  );
  expect(await waitForQueue("result at the topic queue", topicQueue)).toContain(fn);
});

test("DynamoDB stream trigger sends a failing record to the On failure queue", async ({ page }) => {
  await page.goto(`/dynamodb/tables/${table}?tab=settings`);
  await page.getByRole("button", { name: "Add trigger" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Add Lambda trigger/ });
  await choose(page, dialog, /^Function/, { name: new RegExp(fn) });
  await dialog.getByLabel("Retry attempts").fill("0");
  await choose(page, dialog, /On failure/, { name: "SQS queue", exact: true });
  await dialog
    .getByRole("button", { name: /^SQS queue/ })
    .last()
    .click();
  await page.getByRole("option", { name: failureQueue }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(flash(page).getByText(new RegExp(fn))).toBeVisible();

  await waitFor("mapping to be enabled", async () => {
    const { EventSourceMappings = [] } = await lambda.send(
      new ListEventSourceMappingsCommand({ FunctionName: fn }),
    );
    return EventSourceMappings.some((mapping) => mapping.State === "Enabled") ? true : undefined;
  });
  await dynamodb.send(new PutItemCommand({ TableName: table, Item: { id: { S: "flow-1" } } }));
  const body = await waitForQueue("failed batch at the queue", failureQueue);
  expect(body).toContain("DDBStreamBatchInfo");
  expect(body).toContain("RetryAttemptsExhausted");
});

test("SES configuration set sends mail events to an SNS topic, then the queue", async ({
  page,
}) => {
  await page.goto("/ses/configuration-sets");
  await page.getByRole("button", { name: "Create configuration set" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill(configurationSet);
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    flash(page).getByText(`Created configuration set ${configurationSet}`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add destination" }).click();
  const dialog = page.getByRole("dialog", { name: /Add event destination/ });
  await dialog.getByLabel("Destination name").fill("to-sns");
  await dialog
    .getByRole("button", { name: /Event types|Choose/ })
    .first()
    .click();
  await page.getByRole("option", { name: "Delivery" }).click();
  await page.keyboard.press("Escape");
  await dialog
    .getByRole("button", { name: /^SNS topic/ })
    .last()
    .click();
  await page.getByRole("option", { name: sesTopic }).click();
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await expect(flash(page).getByText("Added destination to-sns")).toBeVisible();

  await page.goto("/ses/identities");
  await page
    .getByRole("row", { name: new RegExp(sender) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Set configuration set" }).click();
  const setDialog = page.getByRole("dialog", { name: /Set configuration set/ });
  await choose(page, setDialog, /Default configuration set|None/, { name: configurationSet });
  await setDialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(`${sender} now uses ${configurationSet}`)).toBeVisible();

  // App gửi mail như cũ, không truyền ConfigurationSetName
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [SIMULATOR_SUCCESS] },
      Content: { Simple: { Subject: { Data: "flow" }, Body: { Text: { Data: "hi" } } } },
    }),
  );
  expect(await waitForQueue("mail event at the queue", sesQueue)).toMatch(/Delivery/i);

  await page.goto("/ses/mailbox");
  await expect(page.getByRole("row", { name: /flow/ }).first()).toBeVisible();
});

test("Lambda async and SES send events to the default bus; the bus page lists both senders", async ({
  page,
}) => {
  // Rule trên bus default bắt event của Lambda và đẩy vào queue
  await events.send(
    new PutRuleCommand({
      Name: busRule,
      EventBusName: DEFAULT_BUS,
      EventPattern: JSON.stringify({ source: ["lambda"] }),
    }),
  );
  await events.send(
    new PutTargetsCommand({
      Rule: busRule,
      EventBusName: DEFAULT_BUS,
      Targets: [{ Id: "queue", Arn: queueArns[busQueue] }],
    }),
  );

  await page.goto(`/lambda/functions/${fn}?tab=configuration`);
  await page.getByRole("button", { name: "Edit" }).last().click();
  const dialog = page.getByRole("dialog", { name: /asynchronous invocation/i });
  await dialog.getByLabel("Retry attempts").fill("0");
  await choose(page, dialog, /On success/, { name: "Event bus", exact: true });
  await dialog
    .getByRole("button", { name: /^Event bus/ })
    .last()
    .click();
  await page.getByRole("option", { name: DEFAULT_BUS, exact: true }).click();
  // Gợi ý tạo rule bắt event của Lambda
  await expect(dialog.getByText(/source "lambda"/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Create a rule" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(/Updated asynchronous invocation/)).toBeVisible();
  await expect(page.getByRole("link", { name: DEFAULT_BUS })).toBeVisible();

  await lambda.send(
    new InvokeCommand({
      FunctionName: fn,
      InvocationType: "Event",
      Payload: strToU8(JSON.stringify({ ok: 1 })),
    }),
  );
  expect(await waitForQueue("Lambda event at the bus queue", busQueue)).toContain("lambda");

  // SES cũng gửi vào bus default
  await ses.send(
    new CreateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: configurationSet,
      EventDestinationName: "to-bus",
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ["SEND"],
        EventBridgeDestination: {
          EventBusArn: `arn:aws:events:${region}:${ACCOUNT_ID}:event-bus/${DEFAULT_BUS}`,
        },
      },
    }),
  );

  await page.goto("/eventbridge/rules");
  const senders = page.getByRole("heading", { name: /^Event senders/ });
  await expect(senders).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(fn) })).toContainText("Async success");
  await expect(page.getByRole("row", { name: new RegExp(configurationSet) })).toContainText(
    "SES configuration set",
  );
  await page.getByRole("link", { name: fn }).click();
  await expect(page).toHaveURL(new RegExp(`/lambda/functions/${fn}`));
});
