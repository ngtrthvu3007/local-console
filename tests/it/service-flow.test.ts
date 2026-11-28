import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import {
  AddPermissionCommand,
  CreateEventSourceMappingCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DeleteQueueCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
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

// Dây chuyền giữa các service, đúng những gì console cho nối trên UI:
// S3 notification → Lambda, SQS → Lambda, DynamoDB stream → Lambda; kết quả xem qua CloudWatch Logs.
// Floci chạy Lambda thật trong container (image public.ecr.aws/lambda/nodejs:22).

const functionName = uniqueName("fn");
const bucket = uniqueName("bucket");
const queueName = uniqueName("queue");
const table = uniqueName("table");
const MARKER = "LC_IT_EVENT";

// Lambda in một dòng cho mỗi record: nguồn + thứ nhận diện được record
const HANDLER_SOURCE = `
export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const id = record.s3?.object?.key ?? record.body ?? record.dynamodb?.Keys?.pk?.S;
    console.log("${MARKER}", record.eventSource, id);
  }
  return { received: (event.Records ?? []).length, echo: event.echo ?? null };
};`;

let region: string;
let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
let s3: S3Client;
let sqs: SQSClient;
let dynamodb: DynamoDBClient;
let functionArn: string;
const mappings: string[] = [];

// Đợi tới khi log của Lambda có dòng chứa text
const logLine = (text: string) =>
  waitFor(`Lambda log line "${text}"`, async () => {
    const { events } = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${functionName}`,
        filterPattern: `"${text}"`,
      }),
    );
    return events?.find((event) => event.message?.includes(text))?.message;
  });

beforeAll(async () => {
  region = (await consoleConfig()).region;
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  sqs = new SQSClient(config);
  dynamodb = new DynamoDBClient(config);

  functionArn = (
    await createTestFunction(lambda, {
      name: functionName,
      source: HANDLER_SOURCE,
      timeout: FUNCTION_TIMEOUT_SECONDS,
    })
  ).arn;
});

afterAll(async () => {
  for (const uuid of mappings) {
    await lambda.send(new DeleteEventSourceMappingCommand({ UUID: uuid })).catch(() => undefined);
  }
  await lambda
    .send(new DeleteFunctionCommand({ FunctionName: functionName }))
    .catch(() => undefined);
  for (const key of ["in/photo.png", "out/skip.png"]) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  }
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
  await dynamodb.send(new DeleteTableCommand({ TableName: table })).catch(() => undefined);
  const queueUrl = `${(await consoleConfig()).flociPublicUrl}/${ACCOUNT_ID}/${queueName}`;
  await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })).catch(() => undefined);
});

describe("cross-service flows", () => {
  it("invokes the function directly, as the Test tab does", async () => {
    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: strToU8(JSON.stringify({ echo: "hi" })),
        LogType: "Tail",
      }),
    );
    expect(result.FunctionError).toBeUndefined();
    expect(JSON.parse(new TextDecoder().decode(result.Payload))).toEqual({
      received: 0,
      echo: "hi",
    });
  });

  it("S3 upload → Lambda, honouring the notification prefix filter", async () => {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    await lambda.send(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: `arn:aws:s3:::${bucket}`,
      }),
    );
    // Đúng dạng toNotificationConfiguration của web tạo ra
    await s3.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucket,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "on-upload",
              LambdaFunctionArn: functionArn,
              Events: ["s3:ObjectCreated:*"],
              Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "in/" }] } },
            },
          ],
          QueueConfigurations: [],
          TopicConfigurations: [],
        },
      }),
    );
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "out/skip.png", Body: "x" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "in/photo.png", Body: "x" }));

    expect(await logLine(`${MARKER} aws:s3 in/photo.png`)).toBeTruthy();
    // Object ngoài prefix không được gọi Lambda
    const { events } = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${functionName}`,
        filterPattern: '"out/skip.png"',
      }),
    );
    expect(events ?? []).toEqual([]);
  });

  it("SQS message → Lambda through an event source mapping", async () => {
    const queue = await createTestQueue(sqs, queueName);
    // Đúng tham số tab Triggers gửi khi chọn nguồn SQS
    const mapping = await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionName,
        EventSourceArn: queue.arn,
        BatchSize: 10,
      }),
    );
    mappings.push(mapping.UUID!);
    const body = uniqueName("sqs-body");
    await sqs.send(new SendMessageCommand({ QueueUrl: queue.url, MessageBody: body }));
    expect(await logLine(`${MARKER} aws:sqs ${body}`)).toBeTruthy();
  });

  it("DynamoDB write → stream → Lambda", async () => {
    await dynamodb.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
      }),
    );
    const streamArn = await waitFor("table stream", async () => {
      const { Table } = await dynamodb.send(new DescribeTableCommand({ TableName: table }));
      return Table?.TableStatus === "ACTIVE" ? Table.LatestStreamArn : undefined;
    });
    const mapping = await lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionName,
        EventSourceArn: streamArn,
        StartingPosition: "LATEST",
        BatchSize: 100,
      }),
    );
    mappings.push(mapping.UUID!);
    const pk = uniqueName("item");
    // Mapping có thể cần vài giây mới bắt đầu đọc stream: ghi lại tới khi Lambda thấy
    await waitFor(
      "stream record to reach Lambda",
      async () => {
        await dynamodb.send(new PutItemCommand({ TableName: table, Item: { pk: { S: pk } } }));
        const { events } = await logs.send(
          new FilterLogEventsCommand({
            logGroupName: `/aws/lambda/${functionName}`,
            filterPattern: `"${pk}"`,
          }),
        );
        return events?.some((event) => event.message?.includes(`${MARKER} aws:dynamodb ${pk}`))
          ? true
          : undefined;
      },
      { intervalMs: 3_000 },
    );
  });
});
