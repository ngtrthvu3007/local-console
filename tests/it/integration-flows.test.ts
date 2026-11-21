import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  DeleteFunctionEventInvokeConfigCommand,
  GetEventSourceMappingCommand,
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
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
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Luồng nối nhiều service: đích async của Lambda (SNS, Lambda, event bus) và record lỗi của stream
// DynamoDB tới queue / topic. Mỗi test chờ bằng chứng ở service nhận.

const sourceFunction = uniqueName("src");
const sinkFunction = uniqueName("sink");
const topicName = uniqueName("dest-topic");
const queueNames = {
  topic: uniqueName("q-topic"),
  bus: uniqueName("q-bus"),
  failure: uniqueName("q-fail"),
  streamTopic: uniqueName("q-stream-topic"),
};
const tableName = uniqueName("tbl");
const ruleName = uniqueName("rule");
const SINK_MARKER = "LC_IT_SINK";
const DEFAULT_BUS = "default";

// Lỗi khi event có fail=true hoặc là bản ghi stream; sink ghi log mỗi lần được gọi
const FAILING_SOURCE = `
export const handler = async (event) => {
  if (event.fail || event.Records?.[0]?.eventSource === "aws:dynamodb") throw new Error("flow boom");
  return { ok: true };
};`;
const SINK_SOURCE = `
export const handler = async (event) => {
  console.log("${SINK_MARKER}", JSON.stringify(event));
  return { ok: true };
};`;

let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
let sqs: SQSClient;
let sns: SNSClient;
let events: EventBridgeClient;
let dynamodb: DynamoDBClient;
let topicArn = "";
let sinkArn = "";
let sourceArn = "";
let region = "";
const queueUrls: Record<string, string> = {};
const queueArns: Record<string, string> = {};
const mappings: string[] = [];

const makeQueue = async (name: string) => {
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  queueUrls[name] = QueueUrl!;
  queueArns[name] = (
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }))
  ).Attributes!.QueueArn!;
};

const bodies = async (name: string) =>
  (
    (
      await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrls[name],
          WaitTimeSeconds: 1,
          MaxNumberOfMessages: 10,
        }),
      )
    ).Messages ?? []
  ).map((message) => message.Body ?? "");

const waitForBodies = (description: string, name: string) =>
  waitFor(description, async () => {
    const found = await bodies(name);
    return found.length ? found.join("\n") : undefined;
  });

const createFunction = async (name: string, source: string) => {
  const arn = (
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: { ZipFile: zipSync({ "index.mjs": strToU8(source) }) },
        Timeout: 30,
      }),
    )
  ).FunctionArn!;
  await waitFor(`${name} to be Active`, async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: name }));
    return Configuration?.State === "Active" ? true : undefined;
  });
  return arn;
};

const invokeAsync = (payload: object) =>
  lambda.send(
    new InvokeCommand({
      FunctionName: sourceFunction,
      InvocationType: "Event",
      Payload: strToU8(JSON.stringify(payload)),
    }),
  );

const sinkLogs = async () =>
  (
    (
      await logs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${sinkFunction}`,
          filterPattern: SINK_MARKER,
        }),
      )
    ).events ?? []
  )
    .map((entry) => entry.message ?? "")
    .join("\n");

beforeAll(async () => {
  region = (await consoleConfig()).region;
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);
  sqs = new SQSClient(config);
  sns = new SNSClient(config);
  events = new EventBridgeClient(config);
  dynamodb = new DynamoDBClient(config);

  for (const name of Object.values(queueNames)) await makeQueue(name);
  topicArn = (await sns.send(new CreateTopicCommand({ Name: topicName }))).TopicArn!;
  // Topic đích gửi tiếp vào queue để đọc ra được
  await sns.send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: queueArns[queueNames.topic],
    }),
  );
  sourceArn = await createFunction(sourceFunction, FAILING_SOURCE);
  sinkArn = await createFunction(sinkFunction, SINK_SOURCE);

  // Bus default: bắt event Lambda gửi sang EventBridge
  await events.send(
    new PutRuleCommand({
      Name: ruleName,
      EventBusName: DEFAULT_BUS,
      EventPattern: JSON.stringify({ source: ["lambda"] }),
    }),
  );
  await events.send(
    new PutTargetsCommand({
      Rule: ruleName,
      EventBusName: DEFAULT_BUS,
      Targets: [{ Id: "queue", Arn: queueArns[queueNames.bus] }],
    }),
  );
});

afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  for (const UUID of mappings)
    await quiet(lambda.send(new DeleteEventSourceMappingCommand({ UUID })));
  await quiet(
    lambda.send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: sourceFunction })),
  );
  for (const name of [sourceFunction, sinkFunction])
    await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName: name })));
  await quiet(
    events.send(
      new RemoveTargetsCommand({ Rule: ruleName, EventBusName: DEFAULT_BUS, Ids: ["queue"] }),
    ),
  );
  await quiet(events.send(new DeleteRuleCommand({ Name: ruleName, EventBusName: DEFAULT_BUS })));
  await quiet(sns.send(new DeleteTopicCommand({ TopicArn: topicArn })));
  await quiet(dynamodb.send(new DeleteTableCommand({ TableName: tableName })));
  for (const QueueUrl of Object.values(queueUrls))
    await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl })));
});

describe("async invocation destinations", () => {
  const putDestination = (arn: string) =>
    lambda.send(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: sourceFunction,
        MaximumRetryAttempts: 0,
        DestinationConfig: { OnSuccess: { Destination: arn } },
      }),
    );

  it("success → SNS topic → queue", async () => {
    await putDestination(topicArn);
    await invokeAsync({ n: 1 });
    expect(await waitForBodies("event at the topic queue", queueNames.topic)).toContain(
      sourceFunction,
    );
  });

  it("success → another Lambda function", async () => {
    await putDestination(sinkArn);
    await invokeAsync({ n: 2 });
    const text = await waitFor("sink function log", async () => {
      const found = await sinkLogs();
      return found || undefined;
    });
    expect(text).toContain(sourceFunction);
  });

  it("success → EventBridge default bus → rule → queue", async () => {
    await putDestination(`arn:aws:events:${region}:${ACCOUNT_ID}:event-bus/${DEFAULT_BUS}`);
    await invokeAsync({ n: 3 });
    expect(await waitForBodies("event at the bus queue", queueNames.bus)).toContain("lambda");
  });

  it("failure → SNS topic", async () => {
    await lambda.send(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: sourceFunction,
        MaximumRetryAttempts: 0,
        DestinationConfig: { OnFailure: { Destination: topicArn } },
      }),
    );
    await invokeAsync({ fail: true });
    expect(await waitForBodies("failure at the topic queue", queueNames.topic)).toContain(
      "flow boom",
    );
  });
});

describe("DynamoDB stream failures", () => {
  let streamArn = "";

  beforeAll(async () => {
    const { TableDescription } = await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
      }),
    );
    streamArn = TableDescription!.LatestStreamArn!;
  });

  it("sends a failing record to the on-failure queue", async () => {
    const { UUID } = await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: sourceFunction,
        EventSourceArn: streamArn,
        StartingPosition: "LATEST",
        BatchSize: 1,
        MaximumRetryAttempts: 0,
        DestinationConfig: { OnFailure: { Destination: queueArns[queueNames.failure] } },
      }),
    );
    mappings.push(UUID!);
    await waitFor("mapping to be enabled", async () => {
      const mapping = await lambda.send(new GetEventSourceMappingCommand({ UUID }));
      return mapping.State === "Enabled" ? true : undefined;
    });
    await dynamodb.send(
      new PutItemCommand({ TableName: tableName, Item: { id: { S: "flow-1" } } }),
    );
    // Như AWS: queue nhận thông tin lô lỗi (shard, số thứ tự, lý do), không phải nội dung item
    const body = await waitForBodies("failed record at the queue", queueNames.failure);
    expect(body).toContain("DDBStreamBatchInfo");
    expect(body).toContain("RetryAttemptsExhausted");
    expect(body).toContain(sourceFunction);
  });
});
