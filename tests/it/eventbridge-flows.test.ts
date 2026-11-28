import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
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
  DeleteObjectCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  ACCOUNT_ID,
  FUNCTION_TIMEOUT_SECONDS,
  consoleConfig,
  createTestFunction,
  createTestQueue,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Flow kết hợp: EventBridge với S3, SNS, SQS (Standard và FIFO), Lambda, Scheduler. Mỗi test là một
// đường mà dev dựng khi viết app thật; resource nào có Floci chạy khác AWS thì ghi chú ngay chỗ đó.

const ROLE = "lc-it-role";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}`;
const SOURCE = "lc.it.flows";
const MARKER = "LC_IT_FLOW";

const names = {
  bucket: uniqueName("bucket"),
  topic: uniqueName("topic"),
  fn: uniqueName("fn"),
  bus: uniqueName("bus"),
  queueS3: uniqueName("q-s3"),
  queueTopic: uniqueName("q-topic"),
  queueFanout: uniqueName("q-fan"),
  queueChain: uniqueName("q-chain"),
  queueFifo: `${uniqueName("q-fifo")}.fifo`,
  queueGone: uniqueName("q-gone"),
};
const rules: { name: string; bus?: string }[] = [];
const schedules: string[] = [];

let events: EventBridgeClient;
let sqs: SQSClient;
let sns: SNSClient;
let s3: S3Client;
let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
let scheduler: SchedulerClient;
let topicArn: string;
let functionArn: string;
const queueUrls: Record<string, string> = {};
const queueArns: Record<string, string> = {};

async function makeQueue(name: string, attributes?: Record<string, string>) {
  const { url, arn } = await createTestQueue(sqs, name, attributes);
  queueUrls[name] = url;
  queueArns[name] = arn;
}

async function makeRule(
  name: string,
  pattern: object,
  targets: { Id: string; Arn: string; SqsParameters?: { MessageGroupId: string } }[],
  bus?: string,
) {
  rules.push({ name, bus });
  await events.send(
    new PutRuleCommand({ Name: name, EventBusName: bus, EventPattern: JSON.stringify(pattern) }),
  );
  await events.send(new PutTargetsCommand({ Rule: name, EventBusName: bus, Targets: targets }));
}

const receive = (queueName: string, description: string) =>
  waitFor(description, async () => {
    const received = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrls[queueName],
        WaitTimeSeconds: 1,
        MessageSystemAttributeNames: ["MessageGroupId"],
      }),
    );
    return received.Messages?.[0];
  });

// Log của function dùng chung giữa các test: chờ đúng dòng chứa `needle`
const lambdaLog = (description: string, needle: string) =>
  waitFor(description, async () => {
    const found = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${names.fn}`,
        filterPattern: MARKER,
      }),
    );
    return found.events?.find((event) => event.message?.includes(needle))?.message;
  });

beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  events = new EventBridgeClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);
  scheduler = new SchedulerClient(config);

  for (const name of [
    names.queueS3,
    names.queueTopic,
    names.queueFanout,
    names.queueChain,
    names.queueGone,
  ])
    await makeQueue(name);
  await makeQueue(names.queueFifo, { FifoQueue: "true", ContentBasedDeduplication: "true" });
  topicArn = (await sns.send(new CreateTopicCommand({ Name: names.topic }))).TopicArn!;
  await events.send(new CreateEventBusCommand({ Name: names.bus }));
  await s3.send(new CreateBucketCommand({ Bucket: names.bucket }));

  functionArn = (
    await createTestFunction(lambda, {
      name: names.fn,
      source: `export const handler = async (event) => { console.log("${MARKER}", JSON.stringify(event)); return { ok: true }; };`,
      role: ROLE,
      timeout: FUNCTION_TIMEOUT_SECONDS,
    })
  ).arn;
});

afterAll(async () => {
  for (const { name, bus } of rules) {
    const { Targets = [] } = await events
      .send(new ListTargetsByRuleCommand({ Rule: name, EventBusName: bus }))
      .catch(() => ({ Targets: [] }));
    if (Targets.length)
      await events
        .send(
          new RemoveTargetsCommand({
            Rule: name,
            EventBusName: bus,
            Ids: Targets.map((t) => t.Id!),
          }),
        )
        .catch(() => {});
    await events.send(new DeleteRuleCommand({ Name: name, EventBusName: bus })).catch(() => {});
  }
  for (const name of schedules)
    await scheduler.send(new DeleteScheduleCommand({ Name: name })).catch(() => {});
  await events.send(new DeleteEventBusCommand({ Name: names.bus })).catch(() => {});
  await s3
    .send(new DeleteObjectCommand({ Bucket: names.bucket, Key: "report.csv" }))
    .catch(() => {});
  await s3.send(new DeleteBucketCommand({ Bucket: names.bucket })).catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: names.fn })).catch(() => {});
  await sns.send(new DeleteTopicCommand({ TopicArn: topicArn })).catch(() => {});
  for (const url of Object.values(queueUrls))
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => {});
});

describe("S3 → EventBridge → SQS", () => {
  it("delivers an Object Created event for an upload, with bucket and key", async () => {
    await s3.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: names.bucket,
        NotificationConfiguration: { EventBridgeConfiguration: {} },
      }),
    );
    await makeRule(
      uniqueName("s3-rule"),
      {
        source: ["aws.s3"],
        "detail-type": ["Object Created"],
        detail: { bucket: { name: [names.bucket] } },
      },
      [{ Id: "queue", Arn: queueArns[names.queueS3] }],
    );
    await s3.send(new PutObjectCommand({ Bucket: names.bucket, Key: "report.csv", Body: "a,b" }));

    const message = await receive(names.queueS3, "S3 event in the queue");
    const event = JSON.parse(message.Body!);
    expect(event.source).toBe("aws.s3");
    expect(event["detail-type"]).toBe("Object Created");
    expect(event.detail.bucket.name).toBe(names.bucket);
    expect(event.detail.object.key).toBe("report.csv");
  });
});

describe("EventBridge → SNS → SQS", () => {
  it("fans an event out through a topic to a subscribed queue", async () => {
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArns[names.queueTopic],
        Attributes: { RawMessageDelivery: "true" },
      }),
    );
    await makeRule(uniqueName("sns-rule"), { source: [`${SOURCE}.sns`] }, [
      { Id: "topic", Arn: topicArn },
    ]);
    await events.send(
      new PutEventsCommand({
        Entries: [
          { Source: `${SOURCE}.sns`, DetailType: "ViaTopic", Detail: JSON.stringify({ n: 1 }) },
        ],
      }),
    );

    const message = await receive(names.queueTopic, "event through the topic");
    const event = JSON.parse(message.Body!);
    expect(event.source).toBe(`${SOURCE}.sns`);
    expect(event.detail).toEqual({ n: 1 });
  });
});

describe("one event, three targets", () => {
  it("reaches a queue, a topic subscriber and a function from one PutEvents", async () => {
    // Topic đã có subscriber queueTopic từ test trên; queue này nhận trực tiếp, function ghi log
    await makeRule(uniqueName("fan-rule"), { source: [`${SOURCE}.fan`] }, [
      { Id: "queue", Arn: queueArns[names.queueFanout] },
      { Id: "topic", Arn: topicArn },
      { Id: "fn", Arn: functionArn },
    ]);
    await events.send(
      new PutEventsCommand({
        Entries: [{ Source: `${SOURCE}.fan`, DetailType: "Fan", Detail: JSON.stringify({ n: 2 }) }],
      }),
    );

    expect(JSON.parse((await receive(names.queueFanout, "direct queue")).Body!).detail).toEqual({
      n: 2,
    });
    expect(JSON.parse((await receive(names.queueTopic, "topic subscriber")).Body!).detail).toEqual({
      n: 2,
    });
    expect(await lambdaLog("function log", `${SOURCE}.fan`)).toContain(`${SOURCE}.fan`);
  });
});

describe("Scheduler", () => {
  it("runs a rate schedule against a function with its input", async () => {
    const name = uniqueName("sched-fn");
    schedules.push(name);
    await scheduler.send(
      new CreateScheduleCommand({
        Name: name,
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: functionArn,
          RoleArn: ROLE_ARN,
          Input: JSON.stringify({ from: "schedule", marker: MARKER }),
        },
      }),
    );
    expect(await lambdaLog("schedule invocation log", '"from":"schedule"')).toContain(
      '"from":"schedule"',
    );
  });

  it("chains schedule → event bus → rule → queue", async () => {
    await makeRule(
      uniqueName("chain-rule"),
      { source: [`${SOURCE}.chain`] },
      [{ Id: "queue", Arn: queueArns[names.queueChain] }],
      names.bus,
    );
    const name = uniqueName("sched-bus");
    schedules.push(name);
    await scheduler.send(
      new CreateScheduleCommand({
        Name: name,
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: `arn:aws:events:${(await consoleConfig()).region}:${ACCOUNT_ID}:event-bus/${names.bus}`,
          RoleArn: ROLE_ARN,
          Input: JSON.stringify({ step: "chained" }),
          EventBridgeParameters: { Source: `${SOURCE}.chain`, DetailType: "Scheduled" },
        },
      }),
    );

    const event = JSON.parse((await receive(names.queueChain, "chained event")).Body!);
    expect(event.source).toBe(`${SOURCE}.chain`);
    expect(event["detail-type"]).toBe("Scheduled");
    expect(event.detail).toEqual({ step: "chained" });
  });
});

describe("FIFO queue target", () => {
  it("delivers with the message group ID set on the target", async () => {
    await makeRule(uniqueName("fifo-rule"), { source: [`${SOURCE}.fifo`] }, [
      { Id: "queue", Arn: queueArns[names.queueFifo], SqsParameters: { MessageGroupId: "orders" } },
    ]);
    await events.send(
      new PutEventsCommand({
        Entries: [
          { Source: `${SOURCE}.fifo`, DetailType: "Fifo", Detail: JSON.stringify({ n: 3 }) },
        ],
      }),
    );
    const message = await receive(names.queueFifo, "FIFO message");
    expect(message.Attributes?.MessageGroupId).toBe("orders");
  });
});

describe("a target that was deleted", () => {
  it("keeps the rule and its target, and PutEvents still succeeds", async () => {
    const rule = uniqueName("gone-rule");
    await makeRule(rule, { source: [`${SOURCE}.gone`] }, [
      { Id: "queue", Arn: queueArns[names.queueGone] },
    ]);
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrls[names.queueGone] }));
    delete queueUrls[names.queueGone];

    const result = await events.send(
      new PutEventsCommand({
        Entries: [{ Source: `${SOURCE}.gone`, DetailType: "Gone", Detail: "{}" }],
      }),
    );
    expect(result.FailedEntryCount).toBe(0);
    const { Targets } = await events.send(new ListTargetsByRuleCommand({ Rule: rule }));
    expect(Targets?.map((target) => target.Arn)).toEqual([queueArns[names.queueGone]]);
  });
});
