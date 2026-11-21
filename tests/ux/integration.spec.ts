import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  PutRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  PutBucketNotificationConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  DeleteConfigurationSetCommand,
  DeleteEmailIdentityCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { CreateTopicCommand, DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, test, uniqueName } from "../e2e/fixtures.ts";

// Chụp mọi trang và modal mới của đợt integration ở 4 khung và kiểm không cuộn ngang.
// Ảnh: results/ux/<desktop|laptop|tablet|phone>-<tên>.png
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 768 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
} as const;
const SETTLE_MS = 300; // Cloudscape đổi layout theo khung sau một nhịp

async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: join(testInfo.project.testDir, "..", "results", "ux", `${label}-${name}.png`),
      fullPage,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${name} overflows at ${label}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize(VIEWPORTS.desktop);
}

const fn = uniqueName("fn");
const caller = uniqueName("caller");
const queue = uniqueName("queue");
const topic = uniqueName("topic");
const bucket = uniqueName("bucket");
const table = uniqueName("table");
const bus = uniqueName("bus");
const rule = uniqueName("rule");
const configurationSet = uniqueName("set");
const sender = `${uniqueName("sender")}@example.com`;

test.describe.configure({ mode: "serial" });

let lambda: LambdaClient;
let sqs: SQSClient;
let sns: SNSClient;
let s3: S3Client;
let ses: SESv2Client;
let events: EventBridgeClient;
let dynamodb: DynamoDBClient;
let queueUrl = "";

const makeFunction = async (name: string) => {
  const arn = (
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-lambda`,
        Code: {
          ZipFile: zipSync({
            "index.mjs": strToU8("export const handler = async () => ({ ok: true });"),
          }),
        },
      }),
    )
  ).FunctionArn!;
  await waitFor(`${name} to be Active`, async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: name }));
    return Configuration?.State === "Active" ? true : undefined;
  });
  return arn;
};

// Hai ô cạnh nhau trong một hàng của modal phải ngang nhau: nhãn một bên có thêm dòng mô tả sẽ làm
// ô bên đó lệch xuống
async function expectSameRow(left: Locator, right: Locator) {
  const [a, b] = [await left.boundingBox(), await right.boundingBox()];
  expect(Math.abs(a!.y - b!.y), "fields in one row are misaligned").toBeLessThan(1);
}

const dialogOf = (page: Page, name: RegExp | string): Locator => page.getByRole("dialog", { name });

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  ses = new SESv2Client(config);
  events = new EventBridgeClient(config);
  dynamodb = new DynamoDBClient(config);

  queueUrl = (await sqs.send(new CreateQueueCommand({ QueueName: queue }))).QueueUrl!;
  const queueArn = (
    await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["QueueArn"] }),
    )
  ).Attributes!.QueueArn!;
  const topicArn = (await sns.send(new CreateTopicCommand({ Name: topic }))).TopicArn!;
  const functionArn = await makeFunction(fn);
  await makeFunction(caller);
  await lambda.send(
    new CreateEventSourceMappingCommand({
      FunctionName: functionArn,
      EventSourceArn: queueArn,
      BatchSize: 5,
      FilterCriteria: { Filters: [{ Pattern: JSON.stringify({ body: { type: ["order"] } }) }] },
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    }),
  );
  await lambda.send(
    new PutFunctionEventInvokeConfigCommand({
      FunctionName: caller,
      MaximumRetryAttempts: 1,
      DestinationConfig: {
        OnSuccess: { Destination: queueArn },
        OnFailure: { Destination: functionArn },
      },
    }),
  );
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  await s3.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucket,
      NotificationConfiguration: {
        QueueConfigurations: [{ Id: "q", QueueArn: queueArn, Events: ["s3:ObjectCreated:*"] }],
        TopicConfigurations: [{ Id: "t", TopicArn: topicArn, Events: ["s3:ObjectRemoved:*"] }],
      },
    }),
  );
  await ses.send(new CreateConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
  await ses.send(
    new CreateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: configurationSet,
      EventDestinationName: "to-sns",
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
        SnsDestination: { TopicArn: topicArn },
      },
    }),
  );
  await ses.send(
    new CreateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: configurationSet,
      EventDestinationName: "to-bus",
      EventDestination: {
        Enabled: false,
        MatchingEventTypes: ["SEND"],
        EventBridgeDestination: {
          EventBusArn: `arn:aws:events:${region}:${ACCOUNT_ID}:event-bus/default`,
        },
      },
    }),
  );
  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
  await ses.send(
    new PutEmailIdentityConfigurationSetAttributesCommand({
      EmailIdentity: sender,
      ConfigurationSetName: configurationSet,
    }),
  );
  await events.send(new CreateEventBusCommand({ Name: bus }));
  await events.send(
    new PutRuleCommand({
      Name: rule,
      EventBusName: bus,
      EventPattern: JSON.stringify({ source: ["lc.ux"] }),
    }),
  );
  await dynamodb.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
    }),
  );
});

test.afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  for (const FunctionName of [fn, caller]) {
    const { EventSourceMappings = [] } = await lambda
      .send(new ListEventSourceMappingsCommand({ FunctionName }))
      .catch(() => ({ EventSourceMappings: [] }));
    for (const { UUID } of EventSourceMappings)
      await quiet(lambda.send(new DeleteEventSourceMappingCommand({ UUID })));
    await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName })));
  }
  const { Targets = [] } = await events
    .send(new ListTargetsByRuleCommand({ Rule: rule, EventBusName: bus }))
    .catch(() => ({ Targets: [] }));
  if (Targets.length)
    await quiet(
      events.send(
        new RemoveTargetsCommand({ Rule: rule, EventBusName: bus, Ids: Targets.map((t) => t.Id!) }),
      ),
    );
  await quiet(events.send(new DeleteRuleCommand({ Name: rule, EventBusName: bus })));
  await quiet(events.send(new DeleteEventBusCommand({ Name: bus })));
  await quiet(dynamodb.send(new DeleteTableCommand({ TableName: table })));
  await quiet(ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: sender })));
  await quiet(
    ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: configurationSet })),
  );
  await quiet(
    s3.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucket,
        NotificationConfiguration: {},
      }),
    ),
  );
  await quiet(s3.send(new DeleteBucketCommand({ Bucket: bucket })));
  const topicsArn = (await sns.send(new CreateTopicCommand({ Name: topic }))).TopicArn;
  await quiet(sns.send(new DeleteTopicCommand({ TopicArn: topicsArn })));
  await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })));
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

test("Lambda › Configuration: asynchronous invocation block and modal", async ({
  page,
}, testInfo) => {
  await page.goto(`/lambda/functions/${caller}?tab=configuration`);
  await expect(page.getByRole("heading", { name: "Asynchronous invocation" })).toBeVisible();
  await shot(page, testInfo, "lambda-async-block", true);

  await page.getByRole("button", { name: "Edit" }).last().click();
  const dialog = dialogOf(page, /asynchronous invocation/i);
  await expect(dialog).toBeVisible();
  await shot(page, testInfo, "lambda-async-modal");

  await dialog.getByLabel("Retry attempts").fill("9");
  await dialog.getByRole("button", { name: "Save" }).click();
  await shot(page, testInfo, "lambda-async-modal-validation");

  await dialog.getByLabel("Retry attempts").fill("1");
  await choose(page, dialog, /On success/, { name: "Event bus", exact: true });
  await choose(page, dialog, /^Event bus/, { name: "default", exact: true });
  await expectSameRow(
    dialog.getByRole("button", { name: /On success/ }),
    dialog.getByRole("button", { name: /^Event bus/ }).last(),
  );
  await expectSameRow(
    dialog.getByRole("button", { name: /On failure/ }),
    dialog.getByRole("button", { name: /^Lambda function/ }).last(),
  );
  await shot(page, testInfo, "lambda-async-modal-bus-hint");
});

test("Lambda › Triggers: details, add and edit modals, other senders", async ({
  page,
}, testInfo) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  const row = page.getByRole("row", { name: new RegExp(queue) });
  await expect(row).toContainText("Filter");
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await shot(page, testInfo, "lambda-triggers-senders", true);
  // Tóm tắt filter / partial batch phải hiện cả ở điện thoại
  await page.setViewportSize(VIEWPORTS.phone);
  await expect(page.getByRole("row", { name: new RegExp(queue) })).toContainText("Partial batch");
  await page.setViewportSize(VIEWPORTS.desktop);

  await row.getByRole("radio").click();
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = dialogOf(page, /Edit trigger/);
  await expect(edit).toBeVisible();
  await shot(page, testInfo, "lambda-edit-trigger-modal");
  await setEditor(page, 0, "[1]");
  await edit.getByRole("button", { name: "Save" }).click();
  await shot(page, testInfo, "lambda-edit-trigger-validation");
  await edit.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add trigger" }).first().click();
  const add = dialogOf(page, "Add trigger");
  await add.getByRole("radio", { name: "DynamoDB" }).click();
  await shot(page, testInfo, "lambda-add-trigger-dynamodb");
  await add.getByRole("radio", { name: "SQS" }).click();
  await add.getByRole("button", { name: "Add pattern" }).click();
  await shot(page, testInfo, "lambda-add-trigger-sqs-pattern");
});

test("DynamoDB › Settings: add stream trigger with options", async ({ page }, testInfo) => {
  await page.goto(`/dynamodb/tables/${table}?tab=settings`);
  await page.getByRole("button", { name: "Add trigger" }).first().click();
  const dialog = dialogOf(page, /Add Lambda trigger/);
  await expect(dialog).toBeVisible();
  await choose(page, dialog, /On failure/, { name: "SQS queue", exact: true });
  await expectSameRow(
    dialog.getByRole("button", { name: /On failure/ }),
    dialog.getByRole("button", { name: /^SQS queue/ }).last(),
  );
  await shot(page, testInfo, "dynamodb-add-trigger-modal");
  await dialog.getByLabel("Retry attempts").fill("20000");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await shot(page, testInfo, "dynamodb-add-trigger-validation");
});

test("SES › Configuration sets: page, panel and modals", async ({ page }, testInfo) => {
  await page.goto(`/ses/configuration-sets?set=${configurationSet}`);
  await expect(page.getByRole("heading", { name: "Event destinations" })).toBeVisible();
  await shot(page, testInfo, "ses-config-sets-panel");

  await page.getByRole("button", { name: "Add destination" }).click();
  const add = dialogOf(page, /Add event destination/);
  await shot(page, testInfo, "ses-add-destination-modal");
  await add.getByRole("button", { name: "Add destination" }).click();
  await shot(page, testInfo, "ses-add-destination-validation");
  await add.getByRole("radio", { name: "Event bus" }).click();
  await shot(page, testInfo, "ses-add-destination-event-bus");
  await add.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Create configuration set" }).first().click();
  await shot(page, testInfo, "ses-create-set-modal");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await page
    .getByRole("row", { name: new RegExp(configurationSet) })
    .getByRole("checkbox")
    .click();
  // Panel mở thì thanh nút của trang gom Delete vào menu "More actions"
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await shot(page, testInfo, "ses-delete-set-warning");
});

test("SES › Identities: configuration set column and action", async ({ page }, testInfo) => {
  await page.goto("/ses/identities");
  await expect(page.getByRole("row", { name: new RegExp(sender) })).toContainText(configurationSet);
  await shot(page, testInfo, "ses-identities-column");
  // Khung hẹp không có cột riêng nhưng vẫn phải hiện configuration set của identity
  await page.setViewportSize(VIEWPORTS.tablet);
  await expect(page.getByRole("row", { name: new RegExp(sender) })).toContainText(
    `Set: ${configurationSet}`,
  );
  await page.setViewportSize(VIEWPORTS.desktop);
  await page
    .getByRole("row", { name: new RegExp(sender) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Set configuration set" }).click();
  await shot(page, testInfo, "ses-set-configuration-set-modal");
});

test("EventBridge: event senders, add target, send events", async ({ page }, testInfo) => {
  await page.goto("/eventbridge/rules");
  await expect(page.getByRole("heading", { name: /^Event senders/ })).toBeVisible();
  await shot(page, testInfo, "eventbridge-rules-senders", true);

  await page.goto(`/eventbridge/rules/${bus}/${rule}`);
  await page.getByRole("button", { name: "Add target" }).first().click();
  const target = dialogOf(page, "Add target");
  await choose(page, target, /Type/, { name: "Event bus", exact: true });
  await shot(page, testInfo, "eventbridge-add-target-bus");
  await target.getByRole("button", { name: "Add target" }).click();
  await shot(page, testInfo, "eventbridge-add-target-validation");
  await target.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/eventbridge/buses");
  await page.getByRole("button", { name: "Send events" }).click();
  await shot(page, testInfo, "eventbridge-send-events-modal");
  await page.getByRole("dialog").getByRole("textbox").nth(1).fill("");
  await page.getByRole("dialog").getByRole("button", { name: "Send", exact: true }).click();
  await shot(page, testInfo, "eventbridge-send-events-validation");
});

test("SQS and SNS: other senders", async ({ page }, testInfo) => {
  await page.goto(`/sqs/queues/${queue}?tab=settings`);
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await shot(page, testInfo, "sqs-settings-senders", true);

  await page.goto(`/sns/topics/${topic}?tab=details`);
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await shot(page, testInfo, "sns-details-senders", true);
});
