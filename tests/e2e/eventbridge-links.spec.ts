import {
  CreateAliasCommand,
  PublishVersionCommand,
  DeleteFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { CreateTopicCommand, DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  ACCOUNT_ID,
  consoleConfig,
  createTestFunction,
  createTestQueue,
  viaConsole,
} from "../it/helpers.ts";
import { LAMBDA_ROLE, expect, test, uniqueName } from "./fixtures.ts";

// Rule và schedule của EventBridge hiện ở trang của đích: SQS › Settings, SNS › Details,
// Lambda › Triggers (chỉ xem), và cảnh báo khi xóa đích còn bị trỏ tới

const queue = uniqueName("queue");
const lonelyQueue = uniqueName("lonely");
const topic = uniqueName("topic");
const fn = uniqueName("fn");
const rule = uniqueName("rule");
const schedule = uniqueName("sched");
const aliasRule = uniqueName("alias-rule");
const pagedQueue = uniqueName("paged");
const PAGE_SIZE = 10;
const PAGED_RULES = PAGE_SIZE + 1;
const pagedRules = Array.from({ length: PAGED_RULES }, (_, i) => `${uniqueName("p")}-${i}`);
const ALIAS = "prod";

test.describe.configure({ mode: "serial" });

let sqs: SQSClient;
let sns: SNSClient;
let lambda: LambdaClient;
let events: EventBridgeClient;
let scheduler: SchedulerClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  lambda = new LambdaClient(config);
  events = new EventBridgeClient(config);
  scheduler = new SchedulerClient(config);

  const { arn: queueArn } = await createTestQueue(sqs, queue);
  await sqs.send(new CreateQueueCommand({ QueueName: lonelyQueue }));
  const topicArn = (await sns.send(new CreateTopicCommand({ Name: topic }))).TopicArn!;
  const { arn: functionArn } = await createTestFunction(lambda, {
    name: fn,
    source: "export const handler = async () => ({ ok: true });",
    role: LAMBDA_ROLE,
  });

  // Rule trỏ tới alias của function: cột Resource phải hiện kèm :prod
  const version = (await lambda.send(new PublishVersionCommand({ FunctionName: fn }))).Version!;
  const aliasArn = (
    await lambda.send(
      new CreateAliasCommand({ FunctionName: fn, Name: ALIAS, FunctionVersion: version }),
    )
  ).AliasArn!;
  await events.send(
    new PutRuleCommand({
      Name: aliasRule,
      EventPattern: JSON.stringify({ source: ["lc.e2e.alias"] }),
    }),
  );
  await events.send(
    new PutTargetsCommand({ Rule: aliasRule, Targets: [{ Id: "alias", Arn: aliasArn }] }),
  );

  // Hơn một trang rule cùng trỏ vào một queue: khối EventBridge phải phân trang
  const { arn: pagedArn } = await createTestQueue(sqs, pagedQueue);
  for (const name of pagedRules) {
    await events.send(
      new PutRuleCommand({
        Name: name,
        EventPattern: JSON.stringify({ source: ["lc.e2e.paged"] }),
      }),
    );
    await events.send(new PutTargetsCommand({ Rule: name, Targets: [{ Id: "q", Arn: pagedArn }] }));
  }
  await events.send(
    new PutRuleCommand({ Name: rule, EventPattern: JSON.stringify({ source: ["lc.e2e.links"] }) }),
  );
  await events.send(
    new PutTargetsCommand({
      Rule: rule,
      Targets: [
        { Id: "queue", Arn: queueArn },
        { Id: "topic", Arn: topicArn },
        { Id: "fn", Arn: functionArn },
      ],
    }),
  );
  for (const target of [queueArn, functionArn])
    await scheduler.send(
      new CreateScheduleCommand({
        Name: target === queueArn ? schedule : `${schedule}-fn`,
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: target, RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-role` },
      }),
    );
});

test.afterAll(async () => {
  for (const name of [aliasRule, ...pagedRules]) {
    await events
      .send(new RemoveTargetsCommand({ Rule: name, Ids: ["alias", "q"] }))
      .catch(() => {});
    await events.send(new DeleteRuleCommand({ Name: name })).catch(() => {});
  }
  await events
    .send(new RemoveTargetsCommand({ Rule: rule, Ids: ["queue", "topic", "fn"] }))
    .catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => {});
  for (const name of [schedule, `${schedule}-fn`])
    await scheduler.send(new DeleteScheduleCommand({ Name: name })).catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: fn })).catch(() => {});
  const topics = await sns.send(new CreateTopicCommand({ Name: topic }));
  await sns.send(new DeleteTopicCommand({ TopicArn: topics.TopicArn })).catch(() => {});
  for (const name of [queue, lonelyQueue, pagedQueue]) {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl })).catch(() => {});
  }
});

test("SQS › Settings lists the rule and the schedule that send to the queue", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}?tab=settings`);
  await expect(page.getByRole("heading", { name: /^EventBridge/ })).toBeVisible();
  await expect(page.getByRole("link", { name: rule })).toBeVisible();
  await expect(page.getByRole("link", { name: schedule, exact: true })).toBeVisible();

  await page.getByRole("link", { name: rule }).click();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/rules/default/${rule}$`));
});

test("a queue nothing sends to has no EventBridge block", async ({ page }) => {
  await page.goto(`/sqs/queues/${lonelyQueue}?tab=settings`);
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^EventBridge/ })).toHaveCount(0);
});

test("SNS › Details lists the rule that publishes to the topic", async ({ page }) => {
  await page.goto(`/sns/topics/${topic}?tab=details`);
  await expect(page.getByRole("heading", { name: /^EventBridge/ })).toBeVisible();
  await expect(page.getByRole("link", { name: rule })).toBeVisible();
});

test("Lambda › Triggers shows the rule and the schedule as read-only rows", async ({ page }) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  const ruleRow = page.getByRole("row", { name: new RegExp(`EventBridge.*${rule}`) });
  const scheduleRow = page.getByRole("row", { name: new RegExp(`Scheduler.*${schedule}-fn`) });
  await expect(ruleRow).toBeVisible();
  await expect(scheduleRow).toBeVisible();
  // Chỉ xem: sửa ở trang EventBridge
  await expect(ruleRow.getByRole("radio")).toBeDisabled();
  await expect(scheduleRow.getByRole("radio")).toBeDisabled();

  await ruleRow.getByRole("link", { name: rule }).click();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/rules/default/${rule}$`));
});

test("deleting a queue a rule still sends to warns first", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Delete/ });
  await expect(
    dialog.getByText(new RegExp(`EventBridge rules or schedules still point at\\s+${queue}`)),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("a rule that targets a function alias shows the alias after the function name", async ({
  page,
}) => {
  await page.goto(`/eventbridge/rules/default/${aliasRule}`);
  const row = page.getByRole("row", { name: new RegExp(fn) });
  await expect(row).toContainText(`${fn}:${ALIAS}`);
  // Vẫn là link tới function
  await expect(row.getByRole("link", { name: fn })).toBeVisible();

  // Lambda › Triggers vẫn tìm ra rule trỏ tới alias
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  await expect(
    page.getByRole("row", { name: new RegExp(`EventBridge.*${aliasRule}`) }),
  ).toBeVisible();
});

test("the EventBridge block of a queue paginates when many rules send to it", async ({ page }) => {
  await page.goto(`/sqs/queues/${pagedQueue}?tab=settings`);
  const block = page.getByRole("heading", {
    name: new RegExp(`^EventBridge \\(${PAGED_RULES}\\)`),
  });
  await expect(block).toBeVisible();
  const container = page.locator("[class*='awsui_container_']").filter({ has: block });
  await expect(container.getByRole("row")).toHaveCount(PAGE_SIZE + 1); // + hàng tiêu đề
  await container.getByRole("button", { name: "Next page" }).click();
  await expect(container.getByRole("row")).toHaveCount(2);
});
