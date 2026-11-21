import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
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
  ListFunctionEventInvokeConfigsCommand,
  PutFunctionEventInvokeConfigCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Tùy chọn nâng cao của trigger và cấu hình async của Lambda, gọi thật qua /aws

const functionName = uniqueName("fn");
const resultQueueName = uniqueName("done");
const failureQueueName = uniqueName("fail");
const sourceQueueName = uniqueName("src");
const MARKER = "LC_IT_FILTER";

// Lỗi khi event có fail=true; còn lại ghi log theo body để đếm lần chạy
const HANDLER_SOURCE = `
export const handler = async (event) => {
  if (event.fail) throw new Error("boom");
  for (const record of event.Records ?? []) console.log("${MARKER}", record.body);
  return { ok: true };
};`;

let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
let sqs: SQSClient;
let functionArn: string;
const queueUrls: string[] = [];
const queueArns: Record<string, string> = {};
const mappingIds: string[] = [];

const makeQueue = async (name: string) => {
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  queueUrls.push(QueueUrl!);
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }),
  );
  queueArns[name] = Attributes!.QueueArn!;
  return QueueUrl!;
};

const messagesIn = async (queueUrl: string) =>
  (
    await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: 1,
        MaxNumberOfMessages: 10,
      }),
    )
  ).Messages ?? [];

const markerBodies = async () =>
  (
    (
      await logs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${functionName}`,
          filterPattern: MARKER,
        }),
      )
    ).events ?? []
  ).map((entry) => entry.message ?? "");

beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);
  sqs = new SQSClient(config);

  functionArn = (
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: { ZipFile: zipSync({ "index.mjs": strToU8(HANDLER_SOURCE) }) },
        Timeout: 30,
      }),
    )
  ).FunctionArn!;
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    return Configuration?.State === "Active" ? true : undefined;
  });
  await Promise.all([resultQueueName, failureQueueName, sourceQueueName].map(makeQueue));
});

afterAll(async () => {
  for (const UUID of mappingIds)
    await lambda.send(new DeleteEventSourceMappingCommand({ UUID })).catch(() => {});
  await lambda
    .send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: functionName }))
    .catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => {});
  for (const QueueUrl of queueUrls)
    await sqs.send(new DeleteQueueCommand({ QueueUrl })).catch(() => {});
});

describe("asynchronous invocation", () => {
  it("lists nothing before it is configured (no 404 to read it)", async () => {
    const { FunctionEventInvokeConfigs } = await lambda.send(
      new ListFunctionEventInvokeConfigsCommand({ FunctionName: functionName }),
    );
    expect(FunctionEventInvokeConfigs ?? []).toHaveLength(0);
  });

  it("saves retry, age and destinations, and reads them back through the list", async () => {
    await lambda.send(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: functionName,
        MaximumRetryAttempts: 0,
        MaximumEventAgeInSeconds: 3600,
        DestinationConfig: {
          OnSuccess: { Destination: queueArns[resultQueueName] },
          OnFailure: { Destination: queueArns[failureQueueName] },
        },
      }),
    );
    const { FunctionEventInvokeConfigs } = await lambda.send(
      new ListFunctionEventInvokeConfigsCommand({ FunctionName: functionName }),
    );
    expect(FunctionEventInvokeConfigs).toHaveLength(1);
    expect(FunctionEventInvokeConfigs?.[0]).toMatchObject({
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 3600,
      DestinationConfig: {
        OnSuccess: { Destination: queueArns[resultQueueName] },
        OnFailure: { Destination: queueArns[failureQueueName] },
      },
    });
  });

  it("sends the result to the success queue", async () => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: strToU8(JSON.stringify({ n: 1 })),
      }),
    );
    const found = await waitFor("success record", async () => {
      const messages = await messagesIn(await queueUrlOf(resultQueueName));
      return messages.length ? messages : undefined;
    });
    expect(found[0].Body).toContain("requestContext");
  });

  it("sends the failed event to the failure queue", async () => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: strToU8(JSON.stringify({ fail: true })),
      }),
    );
    const found = await waitFor("failure record", async () => {
      const messages = await messagesIn(await queueUrlOf(failureQueueName));
      return messages.length ? messages : undefined;
    });
    expect(found[0].Body).toContain("boom");
  });

  it("goes back to the defaults once removed", async () => {
    await lambda.send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: functionName }));
    const { FunctionEventInvokeConfigs } = await lambda.send(
      new ListFunctionEventInvokeConfigsCommand({ FunctionName: functionName }),
    );
    expect(FunctionEventInvokeConfigs ?? []).toHaveLength(0);
  });
});

const queueUrlOf = async (name: string) => queueUrls.find((url) => url.endsWith(`/${name}`))!;

describe("SQS trigger with filter patterns", () => {
  let uuid = "";

  it("runs the function only for messages that match one of the patterns", async () => {
    const created = await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionName,
        EventSourceArn: queueArns[sourceQueueName],
        BatchSize: 1,
        FilterCriteria: {
          Filters: [
            { Pattern: JSON.stringify({ body: { type: ["order"] } }) },
            { Pattern: JSON.stringify({ body: { type: ["refund"] } }) },
          ],
        },
      }),
    );
    uuid = created.UUID!;
    mappingIds.push(uuid);
    expect(created.FilterCriteria?.Filters).toHaveLength(2);

    const sourceUrl = await queueUrlOf(sourceQueueName);
    for (const type of ["order", "refund", "spam"])
      await sqs.send(
        new SendMessageCommand({ QueueUrl: sourceUrl, MessageBody: JSON.stringify({ type }) }),
      );

    const bodies = await waitFor("both matching messages", async () => {
      const found = await markerBodies();
      return found.length >= 2 ? found : undefined;
    });
    const joined = bodies.join("\n");
    expect(joined).toContain("order");
    expect(joined).toContain("refund");
    expect(joined).not.toContain("spam");
  });

  it("clears the filters when an update sends an empty list", async () => {
    await lambda.send(
      new UpdateEventSourceMappingCommand({ UUID: uuid, FilterCriteria: { Filters: [] } }),
    );
    const mapping = await lambda.send(new GetEventSourceMappingCommand({ UUID: uuid }));
    expect(mapping.FilterCriteria?.Filters ?? []).toHaveLength(0);
  });

  it("turns partial batch responses on and off", async () => {
    await lambda.send(
      new UpdateEventSourceMappingCommand({
        UUID: uuid,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }),
    );
    const on = await lambda.send(new GetEventSourceMappingCommand({ UUID: uuid }));
    expect(on.FunctionResponseTypes).toEqual(["ReportBatchItemFailures"]);
    await lambda.send(
      new UpdateEventSourceMappingCommand({ UUID: uuid, FunctionResponseTypes: [] }),
    );
    const off = await lambda.send(new GetEventSourceMappingCommand({ UUID: uuid }));
    expect(off.FunctionResponseTypes ?? []).toHaveLength(0);
  });
});

describe("DynamoDB stream trigger options", () => {
  const tableName = uniqueName("tbl");
  let dynamodb: DynamoDBClient;
  let uuid = "";

  beforeAll(async () => {
    dynamodb = new DynamoDBClient(viaConsole((await consoleConfig()).region));
    const { TableDescription } = await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
      }),
    );
    const created = await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionName,
        EventSourceArn: TableDescription!.LatestStreamArn,
        StartingPosition: "LATEST",
        MaximumRetryAttempts: 2,
        MaximumRecordAgeInSeconds: 3600,
        DestinationConfig: { OnFailure: { Destination: queueArns[failureQueueName] } },
      }),
    );
    uuid = created.UUID!;
    mappingIds.push(uuid);
  });

  afterAll(async () => {
    await dynamodb.send(new DeleteTableCommand({ TableName: tableName })).catch(() => {});
  });

  it("keeps retry, record age and the failure destination", async () => {
    const mapping = await lambda.send(new GetEventSourceMappingCommand({ UUID: uuid }));
    expect(mapping).toMatchObject({
      MaximumRetryAttempts: 2,
      MaximumRecordAgeInSeconds: 3600,
      DestinationConfig: { OnFailure: { Destination: queueArns[failureQueueName] } },
    });
  });

  it("removes the failure destination when an update sends an empty DestinationConfig", async () => {
    await lambda.send(new UpdateEventSourceMappingCommand({ UUID: uuid, DestinationConfig: {} }));
    const mapping = await lambda.send(new GetEventSourceMappingCommand({ UUID: uuid }));
    expect(mapping.DestinationConfig?.OnFailure?.Destination).toBeUndefined();
  });
});
