import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand,
  ListExecutionsCommand,
  SFNClient,
  StartExecutionCommand,
  type HistoryEvent,
} from "@aws-sdk/client-sfn";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutEventsCommand,
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
  ACCOUNT_ID,
  FUNCTION_TIMEOUT_SECONDS,
  consoleConfig,
  createTestFunction,
  createTestQueue,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Luồng nối Step Functions với các service khác, mỗi test chờ bằng chứng ở service nhận:
//   EventBridge rule → state machine → Lambda → DynamoDB → SNS → SQS
//   S3 upload → EventBridge → state machine → SQS
//   Scheduler → state machine → SQS
//   state machine → state machine con (.sync)

const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-sfn-flow`;
const names = {
  order: uniqueName("sfn-order"),
  upload: uniqueName("sfn-upload"),
  tick: uniqueName("sfn-tick"),
  parent: uniqueName("sfn-parent"),
  child: uniqueName("sfn-child"),
  fn: uniqueName("sfn-fn"),
  table: uniqueName("sfn-table"),
  topic: uniqueName("sfn-topic"),
  bucket: uniqueName("sfn-bucket"),
  queueTopic: uniqueName("sfn-q-topic"),
  queueUpload: uniqueName("sfn-q-upload"),
  queueTick: uniqueName("sfn-q-tick"),
  ruleOrder: uniqueName("sfn-r-order"),
  ruleUpload: uniqueName("sfn-r-upload"),
  schedule: uniqueName("sfn-sched"),
};
const ORDER_SOURCE = "lc.it.sfn.order";
const UPLOAD_KEY = "report.csv";
const LAMBDA_LABEL = "from-lambda";

const HANDLER_SOURCE = `
export const handler = async (event) => ({ id: event.detail.id, label: "${LAMBDA_LABEL}" });`;

let sfn: SFNClient;
let lambda: LambdaClient;
let dynamodb: DynamoDBClient;
let s3: S3Client;
let sns: SNSClient;
let sqs: SQSClient;
let events: EventBridgeClient;
let scheduler: SchedulerClient;
let region: string;
const queueUrls: Record<string, string> = {};
const queueArns: Record<string, string> = {};
let functionArn = "";
let topicArn = "";

const machineArn = (name: string) => `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${name}`;

async function makeQueue(name: string) {
  const { url, arn } = await createTestQueue(sqs, name);
  queueUrls[name] = url;
  queueArns[name] = arn;
}

async function receive(queue: string, what: string) {
  return waitFor(what, async () => {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrls[queue], WaitTimeSeconds: 1 }),
    );
    return Messages?.[0];
  });
}

const create = (name: string, definition: object) =>
  sfn.send(
    new CreateStateMachineCommand({
      name,
      definition: JSON.stringify(definition),
      roleArn: ROLE_ARN,
    }),
  );

async function finished(machine: string, what: string) {
  return waitFor(what, async () => {
    const { executions = [] } = await sfn.send(
      new ListExecutionsCommand({ stateMachineArn: machineArn(machine) }),
    );
    const done = executions.find((execution) => execution.status !== "RUNNING");
    return done ? done : undefined;
  });
}

const historyOf = async (executionArn: string): Promise<HistoryEvent[]> =>
  (await sfn.send(new GetExecutionHistoryCommand({ executionArn }))).events ?? [];

beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  sfn = new SFNClient(config);
  lambda = new LambdaClient(config);
  dynamodb = new DynamoDBClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  sns = new SNSClient(config);
  sqs = new SQSClient(config);
  events = new EventBridgeClient(config);
  scheduler = new SchedulerClient(config);

  for (const queue of [names.queueTopic, names.queueUpload, names.queueTick])
    await makeQueue(queue);
  topicArn = (await sns.send(new CreateTopicCommand({ Name: names.topic }))).TopicArn!;
  await sns.send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: queueArns[names.queueTopic],
      Attributes: { RawMessageDelivery: "true" },
    }),
  );
  await dynamodb.send(
    new CreateTableCommand({
      TableName: names.table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    }),
  );
  functionArn = (
    await createTestFunction(lambda, {
      name: names.fn,
      source: HANDLER_SOURCE,
      timeout: FUNCTION_TIMEOUT_SECONDS,
    })
  ).arn;
  await s3.send(new CreateBucketCommand({ Bucket: names.bucket }));

  await create(names.order, {
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
        Next: "Notify",
      },
      Notify: {
        Type: "Task",
        Resource: "arn:aws:states:::sns:publish",
        Parameters: { TopicArn: topicArn, "Message.$": "$.id" },
        End: true,
      },
    },
  });
  await create(names.upload, {
    StartAt: "Tell",
    States: {
      Tell: {
        Type: "Task",
        Resource: "arn:aws:states:::sqs:sendMessage",
        Parameters: {
          QueueUrl: queueUrls[names.queueUpload],
          "MessageBody.$": "$.detail.object.key",
        },
        End: true,
      },
    },
  });
  await create(names.tick, {
    StartAt: "Tell",
    States: {
      Tell: {
        Type: "Task",
        Resource: "arn:aws:states:::sqs:sendMessage",
        Parameters: { QueueUrl: queueUrls[names.queueTick], "MessageBody.$": "$.from" },
        End: true,
      },
    },
  });
  await create(names.child, {
    StartAt: "Hi",
    States: { Hi: { Type: "Pass", Result: { ok: true }, End: true } },
  });
  await create(names.parent, {
    StartAt: "RunChild",
    States: {
      RunChild: {
        Type: "Task",
        Resource: "arn:aws:states:::states:startExecution.sync:2",
        Parameters: { StateMachineArn: machineArn(names.child), Input: {} },
        End: true,
      },
    },
  });
});

afterAll(async () => {
  for (const rule of [names.ruleOrder, names.ruleUpload]) {
    await events.send(new RemoveTargetsCommand({ Rule: rule, Ids: ["sfn"] })).catch(() => {});
    await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => {});
  }
  await scheduler.send(new DeleteScheduleCommand({ Name: names.schedule })).catch(() => {});
  for (const machine of [names.order, names.upload, names.tick, names.parent, names.child]) {
    await sfn
      .send(new DeleteStateMachineCommand({ stateMachineArn: machineArn(machine) }))
      .catch(() => {});
  }
  await s3.send(new DeleteObjectCommand({ Bucket: names.bucket, Key: UPLOAD_KEY })).catch(() => {});
  await s3.send(new DeleteBucketCommand({ Bucket: names.bucket })).catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: names.fn })).catch(() => {});
  await dynamodb.send(new DeleteTableCommand({ TableName: names.table })).catch(() => {});
  await sns.send(new DeleteTopicCommand({ TopicArn: topicArn })).catch(() => {});
  for (const url of Object.values(queueUrls))
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => {});
});

describe("EventBridge → state machine → Lambda → DynamoDB → SNS → SQS", () => {
  it("runs the whole chain for one event and leaves proof in every service", async () => {
    await events.send(
      new PutRuleCommand({
        Name: names.ruleOrder,
        EventPattern: JSON.stringify({ source: [ORDER_SOURCE] }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: names.ruleOrder,
        Targets: [{ Id: "sfn", Arn: machineArn(names.order) }],
      }),
    );
    await events.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: ORDER_SOURCE,
            DetailType: "OrderCreated",
            Detail: JSON.stringify({ id: "order-42" }),
          },
        ],
      }),
    );

    const execution = await finished(names.order, "the order execution to finish");
    expect(execution.status).toBe("SUCCEEDED");

    // DynamoDB: Lambda đã làm giàu, bước Save đã ghi
    const { Item } = await dynamodb.send(
      new GetItemCommand({ TableName: names.table, Key: { id: { S: "order-42" } } }),
    );
    expect(Item?.label?.S).toBe(LAMBDA_LABEL);

    // SNS → SQS: topic đã chuyển message tới queue
    expect((await receive(names.queueTopic, "message through the topic")).Body).toBe("order-42");

    // Console dựng link từ chính những event này (taskResource.ts)
    const history = await historyOf(execution.executionArn!);
    const lambdaStep = history.find((event) => event.lambdaFunctionScheduledEventDetails);
    expect(lambdaStep?.lambdaFunctionScheduledEventDetails?.resource).toBe(functionArn);
    const scheduled = history.filter((event) => event.taskScheduledEventDetails);
    expect(scheduled.map((event) => event.taskScheduledEventDetails?.resourceType)).toEqual([
      "dynamodb",
      "sns",
    ]);
    expect(scheduled[0]?.taskScheduledEventDetails?.parameters).toContain(names.table);
    expect(scheduled[1]?.taskScheduledEventDetails?.parameters).toContain(topicArn);
  });
});

describe("S3 → EventBridge → state machine → SQS", () => {
  it("starts the state machine for an upload and passes bucket and key through", async () => {
    await s3.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: names.bucket,
        NotificationConfiguration: { EventBridgeConfiguration: {} },
      }),
    );
    await events.send(
      new PutRuleCommand({
        Name: names.ruleUpload,
        EventPattern: JSON.stringify({
          source: ["aws.s3"],
          "detail-type": ["Object Created"],
          detail: { bucket: { name: [names.bucket] } },
        }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: names.ruleUpload,
        Targets: [{ Id: "sfn", Arn: machineArn(names.upload) }],
      }),
    );
    await s3.send(new PutObjectCommand({ Bucket: names.bucket, Key: UPLOAD_KEY, Body: "a,b" }));

    expect((await receive(names.queueUpload, "the object key in the queue")).Body).toBe(UPLOAD_KEY);
    const execution = await finished(names.upload, "the upload execution to finish");
    expect(execution.status).toBe("SUCCEEDED");
  });
});

describe("Scheduler → state machine → SQS", () => {
  it("runs a one-time schedule whose time has passed, with its input", async () => {
    const pastTime = new Date(Date.now() - 60_000).toISOString().slice(0, 19);
    await scheduler.send(
      new CreateScheduleCommand({
        Name: names.schedule,
        ScheduleExpression: `at(${pastTime})`,
        FlexibleTimeWindow: { Mode: "OFF" },
        ActionAfterCompletion: "NONE",
        Target: {
          Arn: machineArn(names.tick),
          RoleArn: ROLE_ARN,
          Input: JSON.stringify({ from: "scheduler" }),
        },
      }),
    );
    expect((await receive(names.queueTick, "the scheduled message")).Body).toBe("scheduler");
  });
});

describe("state machine → state machine", () => {
  it("waits for a child execution with .sync and records it under the child", async () => {
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({ stateMachineArn: machineArn(names.parent), input: "{}" }),
    );
    const parent = await waitFor("parent to finish", async () => {
      const described = await sfn.send(new DescribeExecutionCommand({ executionArn }));
      return described.status === "RUNNING" ? undefined : described;
    });
    expect(parent.status).toBe("SUCCEEDED");

    const child = await finished(names.child, "the child execution");
    expect(child.status).toBe("SUCCEEDED");
    const scheduled = (await historyOf(executionArn!)).find(
      (event) => event.taskScheduledEventDetails,
    );
    expect(scheduled?.taskScheduledEventDetails?.resourceType).toBe("states");
    expect(scheduled?.taskScheduledEventDetails?.parameters).toContain(names.child);
  });
});
