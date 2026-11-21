import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetSubscriptionAttributesCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  ListSubscriptionsCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các luồng của trang SNS: ARN ghép từ tên, fan-out vào SQS (raw, filter), FIFO, HTTP chờ xác nhận

const topicName = uniqueName("topic");
const fifoTopicName = `${uniqueName("fifo")}.fifo`;
const filteredQueueName = uniqueName("filtered");
const rawQueueName = uniqueName("raw");

let region: string;
let sns: SNSClient;
let sqs: SQSClient;
let topicArn: string;
let fifoTopicArn: string;
const queueUrls: string[] = [];
let filteredUrl: string;
let rawUrl: string;
let filteredSubscription: string;

// Giống web/src/services/sns/topics.ts: topic không có URL, ARN ghép từ region + account của Floci
const arnFor = (name: string) => `arn:aws:sns:${region}:${ACCOUNT_ID}:${name}`;

const queueArnOf = async (url: string) =>
  (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] })))
    .Attributes!.QueueArn!;

async function createQueue(name: string, attributes?: Record<string, string>) {
  const url = (await sqs.send(new CreateQueueCommand({ QueueName: name, Attributes: attributes })))
    .QueueUrl!;
  queueUrls.push(url);
  return url;
}

async function drain(url: string) {
  const { Messages = [] } = await sqs.send(
    new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
  );
  return Messages;
}

// Chờ tới khi queue nhận đủ `count` message
const receive = (url: string, count: number) =>
  waitFor(`${count} message(s) in the queue`, async () => {
    const messages = await drain(url);
    return messages.length >= count ? messages : undefined;
  });

const publishOrder = (type: string) =>
  sns.send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: `body-${type}`,
      MessageAttributes: { type: { DataType: "String", StringValue: type } },
    }),
  );

beforeAll(async () => {
  region = (await consoleConfig()).region;
  sns = new SNSClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
  topicArn = (await sns.send(new CreateTopicCommand({ Name: topicName }))).TopicArn!;
  fifoTopicArn = (
    await sns.send(
      new CreateTopicCommand({
        Name: fifoTopicName,
        Attributes: { FifoTopic: "true", ContentBasedDeduplication: "true" },
      }),
    )
  ).TopicArn!;
  filteredUrl = await createQueue(filteredQueueName);
  rawUrl = await createQueue(rawQueueName);
});

afterAll(async () => {
  for (const arn of [topicArn, fifoTopicArn].filter(Boolean))
    await sns.send(new DeleteTopicCommand({ TopicArn: arn })).catch(() => undefined);
  for (const url of queueUrls)
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => undefined);
});

describe("SNS through the console proxy", () => {
  it("finds a topic by the ARN the console builds from its name", async () => {
    expect(topicArn).toBe(arnFor(topicName));
    const { Attributes } = await sns.send(new GetTopicAttributesCommand({ TopicArn: arnFor(topicName) }));
    expect(Attributes?.TopicArn).toBe(topicArn);
    const fifo = await sns.send(new GetTopicAttributesCommand({ TopicArn: arnFor(fifoTopicName) }));
    expect(fifo.Attributes?.FifoTopic).toBe("true");
  });

  it("fans out to SQS: a filtered queue gets only matching messages, a raw one gets bodies", async () => {
    const filtered = await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: await queueArnOf(filteredUrl),
        ReturnSubscriptionArn: true,
        Attributes: { FilterPolicy: '{"type": ["order"]}', FilterPolicyScope: "MessageAttributes" },
      }),
    );
    filteredSubscription = filtered.SubscriptionArn!;
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: await queueArnOf(rawUrl),
        ReturnSubscriptionArn: true,
        Attributes: { RawMessageDelivery: "true" },
      }),
    );

    await publishOrder("user");
    await publishOrder("order");

    const rawBodies = (await receive(rawUrl, 2)).map((message) => message.Body).sort();
    expect(rawBodies).toEqual(["body-order", "body-user"]);

    const [onlyOrder] = await receive(filteredUrl, 1);
    // Không raw: body là envelope JSON của SNS
    const envelope = JSON.parse(onlyOrder.Body!) as { Type: string; Message: string };
    expect(envelope.Type).toBe("Notification");
    expect(envelope.Message).toBe("body-order");
    expect(await drain(filteredUrl)).toHaveLength(0);
  });

  it("reads subscription attributes the way the Subscriptions tab does", async () => {
    const { Subscriptions } = await sns.send(
      new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
    );
    expect(Subscriptions).toHaveLength(2);
    const { Attributes } = await sns.send(
      new GetSubscriptionAttributesCommand({ SubscriptionArn: filteredSubscription }),
    );
    expect(Attributes?.PendingConfirmation).toBe("false");
    expect(JSON.parse(Attributes!.FilterPolicy)).toEqual({ type: ["order"] });
  });

  it("lists the subscriptions that point at one queue", async () => {
    const endpoint = await queueArnOf(filteredUrl);
    const { Subscriptions } = await sns.send(new ListSubscriptionsCommand({}));
    const mine = (Subscriptions ?? []).filter((item) => item.Endpoint === endpoint);
    expect(mine.map((item) => item.TopicArn)).toEqual([topicArn]);
  });

  it("removes a filter policy with an empty value", async () => {
    await sns.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: filteredSubscription,
        AttributeName: "FilterPolicy",
        AttributeValue: "",
      }),
    );
    await publishOrder("user");
    await receive(filteredUrl, 1);
  });

  it("keeps an HTTP subscription pending until the app confirms it", async () => {
    const { SubscriptionArn } = await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "http",
        Endpoint: "http://host.docker.internal:9/sns",
        ReturnSubscriptionArn: true,
      }),
    );
    const { Attributes } = await sns.send(
      new GetSubscriptionAttributesCommand({ SubscriptionArn }),
    );
    expect(Attributes?.PendingConfirmation).toBe("true");
  });

  it("rejects a FIFO publish without a group ID, and drops a duplicate", async () => {
    await expect(
      sns.send(new PublishCommand({ TopicArn: fifoTopicArn, Message: "m" })),
    ).rejects.toMatchObject({ name: "InvalidParameterException" });

    const fifoQueueUrl = await createQueue(`${uniqueName("fifoq")}.fifo`, {
      FifoQueue: "true",
      ContentBasedDeduplication: "true",
    });
    await sns.send(
      new SubscribeCommand({
        TopicArn: fifoTopicArn,
        Protocol: "sqs",
        Endpoint: await queueArnOf(fifoQueueUrl),
      }),
    );
    for (let copy = 0; copy < 2; copy++)
      await sns.send(
        new PublishCommand({ TopicArn: fifoTopicArn, Message: "same", MessageGroupId: "g1" }),
      );
    const messages = await receive(fifoQueueUrl, 1);
    expect(messages).toHaveLength(1);
    expect(await drain(fifoQueueUrl)).toHaveLength(0);
  });
});
