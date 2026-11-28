import {
  DeleteFunctionCommand,
  LambdaClient,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
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
  DeleteConfigurationSetCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { CreateTopicCommand, DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import { DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  consoleConfig,
  createTestFunction,
  createTestQueue,
  viaConsole,
  waitFor,
} from "../it/helpers.ts";
import { LAMBDA_ROLE, choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Nối thêm hai chỗ: rule gửi sang bus khác (target Event bus) và khối "Other senders" trên trang
// queue / topic / function (S3, Lambda, SES đang gửi vào resource này)

const fn = uniqueName("fn");
const caller = uniqueName("caller");
const queue = uniqueName("queue");
const topic = uniqueName("topic");
const bucket = uniqueName("bucket");
const configurationSet = uniqueName("set");
const sourceBus = uniqueName("bus-src");
const targetBus = uniqueName("bus-dst");
const forwardRule = uniqueName("fwd");
const catchRule = uniqueName("catch");
const SOURCE = "lc.e2e.forward";

test.describe.configure({ mode: "serial" });

let lambda: LambdaClient;
let sqs: SQSClient;
let sns: SNSClient;
let s3: S3Client;
let ses: SESv2Client;
let events: EventBridgeClient;
let queueUrl = "";
let queueArn = "";
let topicArn = "";

const makeFunction = async (name: string) =>
  (
    await createTestFunction(lambda, {
      name,
      source: "export const handler = async () => ({ ok: true });",
      role: LAMBDA_ROLE,
    })
  ).arn;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  ses = new SESv2Client(config);
  events = new EventBridgeClient(config);

  ({ url: queueUrl, arn: queueArn } = await createTestQueue(sqs, queue));
  topicArn = (await sns.send(new CreateTopicCommand({ Name: topic }))).TopicArn!;
  const functionArn = await makeFunction(fn);
  await makeFunction(caller);

  // Ai gửi vào queue: S3 notification và Lambda async; vào topic: S3, SES; vào function: Lambda async
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  await s3.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucket,
      NotificationConfiguration: {
        QueueConfigurations: [
          { Id: "to-queue", QueueArn: queueArn, Events: ["s3:ObjectCreated:*"] },
        ],
        TopicConfigurations: [
          { Id: "to-topic", TopicArn: topicArn, Events: ["s3:ObjectRemoved:*"] },
        ],
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
        MatchingEventTypes: ["SEND"],
        SnsDestination: { TopicArn: topicArn },
      },
    }),
  );
  await lambda.send(
    new PutFunctionEventInvokeConfigCommand({
      FunctionName: caller,
      MaximumRetryAttempts: 0,
      DestinationConfig: {
        OnSuccess: { Destination: queueArn },
        OnFailure: { Destination: functionArn },
      },
    }),
  );

  // Hai bus: rule ở bus nguồn sẽ được thêm target Event bus bằng UI
  await events.send(new CreateEventBusCommand({ Name: sourceBus }));
  await events.send(new CreateEventBusCommand({ Name: targetBus }));
  await events.send(
    new PutRuleCommand({
      Name: catchRule,
      EventBusName: targetBus,
      EventPattern: JSON.stringify({ source: [SOURCE] }),
    }),
  );
  await events.send(
    new PutTargetsCommand({
      Rule: catchRule,
      EventBusName: targetBus,
      Targets: [{ Id: "queue", Arn: queueArn }],
    }),
  );
  await events.send(
    new PutRuleCommand({
      Name: forwardRule,
      EventBusName: sourceBus,
      EventPattern: JSON.stringify({ source: [SOURCE] }),
    }),
  );
});

test.afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  const { Targets = [] } = await events
    .send(new ListTargetsByRuleCommand({ Rule: forwardRule, EventBusName: sourceBus }))
    .catch(() => ({ Targets: [] }));
  if (Targets.length)
    await quiet(
      events.send(
        new RemoveTargetsCommand({
          Rule: forwardRule,
          EventBusName: sourceBus,
          Ids: Targets.map((target) => target.Id!),
        }),
      ),
    );
  await quiet(events.send(new DeleteRuleCommand({ Name: forwardRule, EventBusName: sourceBus })));
  await quiet(
    events.send(
      new RemoveTargetsCommand({ Rule: catchRule, EventBusName: targetBus, Ids: ["queue"] }),
    ),
  );
  await quiet(events.send(new DeleteRuleCommand({ Name: catchRule, EventBusName: targetBus })));
  for (const Name of [sourceBus, targetBus])
    await quiet(events.send(new DeleteEventBusCommand({ Name })));
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
  for (const FunctionName of [fn, caller])
    await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName })));
  await quiet(sns.send(new DeleteTopicCommand({ TopicArn: topicArn })));
  await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })));
});

test("a rule forwards events to another event bus through an Event bus target", async ({
  page,
}) => {
  await page.goto(`/eventbridge/rules/${sourceBus}/${forwardRule}`);
  await page.getByRole("button", { name: "Add target" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add target" });
  await choose(page, dialog, /Type/, { name: "Event bus", exact: true });
  await dialog
    .getByRole("button", { name: /^Event bus/ })
    .last()
    .click();
  // Không cho chọn chính bus của rule (event sẽ quay vòng)
  await expect(page.getByRole("option", { name: sourceBus, exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: targetBus, exact: true }).click();
  await dialog.getByRole("button", { name: "Add target" }).click();
  await expect(flash(page).getByText("Added target")).toBeVisible();
  await expect(page.getByRole("link", { name: targetBus })).toBeVisible();

  await events.send(
    new PutEventsCommand({
      Entries: [{ EventBusName: sourceBus, Source: SOURCE, DetailType: "Forwarded", Detail: "{}" }],
    }),
  );
  const message = await waitFor("forwarded event at the queue", async () => {
    const found = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
    );
    return found.Messages?.find((item) => item.Body?.includes("Forwarded"))?.Body;
  });
  expect(message).toContain(SOURCE);
});

test("queue page lists the S3 notification and the Lambda async destination that send to it", async ({
  page,
}) => {
  await page.goto(`/sqs/queues/${queue}?tab=settings`);
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(bucket) })).toContainText(
    "S3 notification",
  );
  await expect(page.getByRole("row", { name: new RegExp(caller) })).toContainText("On success");
  await page.getByRole("link", { name: bucket }).click();
  await expect(page).toHaveURL(new RegExp(`/s3/buckets/${bucket}`));
});

test("topic page lists the S3 notification and the SES configuration set that send to it", async ({
  page,
}) => {
  await page.goto(`/sns/topics/${topic}?tab=details`);
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(bucket) })).toContainText(
    "S3 notification",
  );
  await expect(page.getByRole("row", { name: new RegExp(configurationSet) })).toContainText(
    "SES configuration set",
  );
});

test("function page lists the function whose async destination is this function", async ({
  page,
}) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  await expect(page.getByRole("heading", { name: /^Other senders/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(caller) })).toContainText("On failure");
});

// Cloudscape thêm padding-right vào body khi mở modal; gutter đã cố định nên nội dung không được co
test("opening a modal keeps the page width", async ({ page }) => {
  await page.goto("/eventbridge/buses");
  await expect(page.getByRole("heading", { name: /^Event buses/ })).toBeVisible();
  const widths = () =>
    page.evaluate(() =>
      ["main", "input[type=search]", "table"].map(
        (selector) => document.querySelector(selector)?.getBoundingClientRect().width,
      ),
    );
  const before = await widths();
  await page.getByRole("button", { name: "Create event bus" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await widths()).toEqual(before);
});
