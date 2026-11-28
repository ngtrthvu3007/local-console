import {
  CreateEventSourceMappingCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetEventSourceMappingCommand,
  LambdaClient,
  ListFunctionEventInvokeConfigsCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  DeleteConfigurationSetCommand,
  DeleteEmailIdentityCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { CreateTopicCommand, DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { consoleConfig, createTestFunction, createTestQueue, viaConsole } from "../it/helpers.ts";
import { LAMBDA_ROLE, choose, expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Ba nhóm của spec integration-enhancements: tùy chọn trigger (Add / Edit), cấu hình async của
// Lambda, và configuration set của SES. Tạo sẵn resource bằng SDK, thao tác trên UI, đọc lại bằng SDK.

const fn = uniqueName("fn");
const queue = uniqueName("queue");
const failureQueue = uniqueName("fail");
const topic = uniqueName("topic");
const configurationSet = uniqueName("set");
const sender = `${uniqueName("sender")}@example.com`;
const BATCH_SIZE = "5";
const DESTINATION = "to-sns";

test.describe.configure({ mode: "serial" });

let lambda: LambdaClient;
let sqs: SQSClient;
let sns: SNSClient;
let ses: SESv2Client;
let topicArn = "";
let mappingUuid = "";

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  ses = new SESv2Client(config);

  const { arn: queueArn } = await createTestQueue(sqs, queue);
  await sqs.send(new CreateQueueCommand({ QueueName: failureQueue }));
  topicArn = (await sns.send(new CreateTopicCommand({ Name: topic }))).TopicArn!;
  const { arn: functionArn } = await createTestFunction(lambda, {
    name: fn,
    source: "export const handler = async () => ({ ok: true });",
    role: LAMBDA_ROLE,
  });
  mappingUuid = (
    await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionArn,
        EventSourceArn: queueArn,
        BatchSize: 10,
        FilterCriteria: { Filters: [{ Pattern: JSON.stringify({ body: { type: ["order"] } }) }] },
      }),
    )
  ).UUID!;

  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
  await ses.send(new CreateConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
});

test.afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  await quiet(lambda.send(new DeleteEventSourceMappingCommand({ UUID: mappingUuid })));
  await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName: fn })));
  await quiet(sns.send(new DeleteTopicCommand({ TopicArn: topicArn })));
  await quiet(ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: sender })));
  await quiet(
    ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: configurationSet })),
  );
  for (const name of [queue, failureQueue]) {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
    await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl })));
  }
});

test("Lambda › Triggers: Details shows the filter, Edit adds a pattern and a partial batch", async ({
  page,
}) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  const row = page.getByRole("row", { name: new RegExp(`SQS.*${queue}`) });
  await expect(row).toContainText("Filter");
  await row.getByRole("radio").click();

  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: /Edit trigger/ });
  await dialog.getByLabel("Batch size").fill(BATCH_SIZE);
  await dialog.getByRole("button", { name: "Add pattern" }).click();
  await setEditor(page, '{"body": {"type": ["refund"]}}', 1);
  await dialog.getByText("Report batch item failures").click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(/Updated trigger/)).toBeVisible();
  await expect(row).toContainText("Partial batch");

  const mapping = await lambda.send(new GetEventSourceMappingCommand({ UUID: mappingUuid }));
  expect(mapping.BatchSize).toBe(Number(BATCH_SIZE));
  expect(mapping.FilterCriteria?.Filters).toHaveLength(2);
  expect(mapping.FunctionResponseTypes).toEqual(["ReportBatchItemFailures"]);
});

test("Lambda › Configuration: save and remove the asynchronous invocation settings", async ({
  page,
}) => {
  await page.goto(`/lambda/functions/${fn}?tab=configuration`);
  const block = page.getByRole("heading", { name: "Asynchronous invocation" });
  await expect(block).toBeVisible();
  await expect(page.getByText("6h 0m")).toBeVisible(); // mặc định của AWS khi chưa cấu hình

  await page.getByRole("button", { name: "Edit" }).last().click();
  const dialog = page.getByRole("dialog", { name: /asynchronous invocation/i });
  await dialog.getByLabel("Retry attempts").fill("0");
  await choose(page, dialog, /On failure/, { name: "SQS queue", exact: true });
  await dialog
    .getByRole("button", { name: /^SQS queue/ })
    .last()
    .click();
  await page.getByRole("option", { name: failureQueue }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(/Updated asynchronous invocation/)).toBeVisible();

  const { FunctionEventInvokeConfigs } = await lambda.send(
    new ListFunctionEventInvokeConfigsCommand({ FunctionName: fn }),
  );
  expect(FunctionEventInvokeConfigs?.[0].MaximumRetryAttempts).toBe(0);
  expect(FunctionEventInvokeConfigs?.[0].DestinationConfig?.OnFailure?.Destination).toContain(
    failureQueue,
  );
  await expect(page.getByRole("link", { name: failureQueue })).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(flash(page).getByText(/Removed asynchronous invocation/)).toBeVisible();
  const after = await lambda.send(new ListFunctionEventInvokeConfigsCommand({ FunctionName: fn }));
  expect(after.FunctionEventInvokeConfigs ?? []).toHaveLength(0);
});

test("SES › Configuration sets: add an SNS destination, then disable it", async ({ page }) => {
  await page.goto(`/ses/configuration-sets?set=${configurationSet}`);
  await expect(page.getByRole("heading", { name: "Event destinations" })).toBeVisible();

  await page.getByRole("button", { name: "Add destination" }).click();
  const dialog = page.getByRole("dialog", { name: /Add event destination/ });
  await dialog.getByLabel("Destination name").fill(DESTINATION);
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
  await page.getByRole("option", { name: topic }).click();
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await expect(flash(page).getByText(`Added destination ${DESTINATION}`)).toBeVisible();

  const find = async () =>
    (
      await ses.send(
        new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configurationSet }),
      )
    ).EventDestinations?.find((item) => item.Name === DESTINATION);
  expect((await find())?.SnsDestination?.TopicArn).toBe(topicArn);

  await page
    .getByRole("row", { name: new RegExp(DESTINATION) })
    .getByRole("radio")
    .click();
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(flash(page).getByText(`Disabled destination ${DESTINATION}`)).toBeVisible();
  expect((await find())?.Enabled).toBe(false);
});

test("SES › Identities: set the default configuration set, and the set shows who uses it", async ({
  page,
}) => {
  await page.goto("/ses/identities");
  await page
    .getByRole("row", { name: new RegExp(sender) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Set configuration set" }).click();
  const dialog = page.getByRole("dialog", { name: /Set configuration set/ });
  await choose(page, dialog, /Default configuration set|None/, { name: configurationSet });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(`${sender} now uses ${configurationSet}`)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(sender) })).toContainText(configurationSet);

  expect(
    (await ses.send(new GetEmailIdentityCommand({ EmailIdentity: sender }))).ConfigurationSetName,
  ).toBe(configurationSet);

  await page.goto("/ses/configuration-sets");
  await expect(page.getByRole("row", { name: new RegExp(configurationSet) })).toContainText(sender);
  // Xóa set đang là mặc định: modal cảnh báo identity đang dùng
  await page
    .getByRole("row", { name: new RegExp(configurationSet) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText(`Still the default of ${sender}`);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

// Trang mới không được cuộn ngang ở 1440, 1024 và 390px
for (const width of [1440, 1024, 390]) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      `/lambda/functions/${fn}?tab=configuration`,
      `/lambda/functions/${fn}?tab=triggers`,
      `/ses/configuration-sets?set=${configurationSet}`,
      "/ses/identities",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
    }
  });
}
