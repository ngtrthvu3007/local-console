import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  ListShardsCommand,
} from "@aws-sdk/client-kinesis";
import { DeleteFunctionCommand, GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
  DeleteLogGroupCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { consoleConfig, createTestFunction, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Hành vi CloudWatch Logs của Floci mà trang Logs dựa vào, qua proxy /aws của console (spec mục 7)

const RETENTION_DAYS = 7;
// AWS chỉ nhận một số giá trị cố định; 8 không nằm trong đó
const RETENTION_AWS_REJECTS = 8;
const STREAM_GAP_MS = 50;

let logs: CloudWatchLogsClient;
const created: string[] = [];

const newGroup = async () => {
  const name = `/${uniqueName("logs")}`;
  await logs.send(new CreateLogGroupCommand({ logGroupName: name }));
  created.push(name);
  return name;
};

// Lọc theo prefix rồi so khớp đúng tên, như trang Logs làm
const findGroup = async (name: string) =>
  (await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: name }))).logGroups?.find(
    (group) => group.logGroupName === name,
  );

// Đúng chuỗi lời gọi của Send test event: hỏi stream trước, thiếu mới tạo (CreateLogStream mù trả 400)
const sendTestEvent = async (group: string, stream: string, message: string) => {
  const { logStreams = [] } = await logs.send(
    new DescribeLogStreamsCommand({ logGroupName: group, logStreamNamePrefix: stream }),
  );
  if (!logStreams.some((item) => item.logStreamName === stream))
    await logs.send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: stream }));
  await logs.send(
    new PutLogEventsCommand({
      logGroupName: group,
      logStreamName: stream,
      logEvents: [{ timestamp: Date.now(), message }],
    }),
  );
};

const messagesMatching = async (group: string, filterPattern: string) =>
  (
    (await logs.send(new FilterLogEventsCommand({ logGroupName: group, filterPattern }))).events ??
    []
  ).map((event) => event.message);

let config: ReturnType<typeof viaConsole>;

beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
  logs = new CloudWatchLogsClient(config);
});

afterAll(async () => {
  for (const name of created)
    await logs.send(new DeleteLogGroupCommand({ logGroupName: name })).catch(() => undefined);
});

describe("log groups", () => {
  it("creates a log group with retention, changes it to never expire and deletes it", async () => {
    const name = await newGroup();
    await logs.send(
      new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: RETENTION_DAYS }),
    );
    expect((await findGroup(name))?.retentionInDays).toBe(RETENTION_DAYS);

    await logs.send(new DeleteRetentionPolicyCommand({ logGroupName: name }));
    expect(await findGroup(name)).toMatchObject({ logGroupName: name });
    expect((await findGroup(name))?.retentionInDays).toBeUndefined();

    await logs.send(new DeleteLogGroupCommand({ logGroupName: name }));
    expect(await findGroup(name)).toBeUndefined();
  });

  // Lệch AWS (spec 7 #2): form chỉ cho chọn giá trị AWS nhận
  it("accepts a retention AWS rejects", async () => {
    const name = await newGroup();
    await expect(
      logs.send(
        new PutRetentionPolicyCommand({
          logGroupName: name,
          retentionInDays: RETENTION_AWS_REJECTS,
        }),
      ),
    ).resolves.toBeDefined();
  });
});

describe("log events", () => {
  it("finds events by text and JSON filter patterns", async () => {
    const group = await newGroup();
    const json = JSON.stringify({ level: "ERROR", code: 500 });
    await sendTestEvent(group, "app", "ERROR boom");
    await sendTestEvent(group, "app", json);

    expect((await messagesMatching(group, "ERROR")).sort()).toEqual(["ERROR boom", json].sort());
    expect(await messagesMatching(group, "{ $.code >= 500 }")).toEqual([json]);
  });

  it("sends a test event twice to a new stream without an error", async () => {
    const group = await newGroup();
    await sendTestEvent(group, "console-test", "first");
    await sendTestEvent(group, "console-test", "second");

    const { events = [] } = await logs.send(
      new GetLogEventsCommand({ logGroupName: group, logStreamName: "console-test" }),
    );
    expect(events.map((event) => event.message)).toEqual(["first", "second"]);
  });

  it("lists streams with the latest event first", async () => {
    const group = await newGroup();
    await sendTestEvent(group, "older", "a");
    // Floci tính lastEventTimestamp theo ms: chờ một chút để hai stream khác thời điểm
    await new Promise((resolve) => setTimeout(resolve, STREAM_GAP_MS));
    await sendTestEvent(group, "newer", "b");

    const { logStreams = [] } = await logs.send(
      new DescribeLogStreamsCommand({
        logGroupName: group,
        orderBy: "LastEventTime",
        descending: true,
      }),
    );
    expect(logStreams.map((stream) => stream.logStreamName)).toEqual(["newer", "older"]);
  });
});

// Lambda đích giải nén event.awslogs.data rồi in từng message, để test đọc lại từ log của nó
const RECEIVER_SOURCE = `
import { gunzipSync } from "node:zlib";
export const handler = async (event) => {
  const data = JSON.parse(gunzipSync(Buffer.from(event.awslogs.data, "base64")).toString());
  for (const logEvent of data.logEvents) console.log("got " + logEvent.message);
};
`;

describe("subscription filters", () => {
  const receiver = uniqueName("logs-receiver");
  const stream = uniqueName("logs-stream");
  let lambda: LambdaClient;
  let kinesis: KinesisClient;

  beforeAll(async () => {
    lambda = new LambdaClient(config);
    kinesis = new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() });
  });

  afterAll(async () => {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: receiver })).catch(() => undefined);
    await logs
      .send(new DeleteLogGroupCommand({ logGroupName: `/aws/lambda/${receiver}` }))
      .catch(() => undefined);
    await kinesis.send(new DeleteStreamCommand({ StreamName: stream })).catch(() => undefined);
  });

  it("delivers matching events to a Lambda subscription filter", async () => {
    const { arn: functionArn } = await createTestFunction(lambda, {
      name: receiver,
      source: RECEIVER_SOURCE,
    });
    const group = await newGroup();
    await logs.send(
      new PutSubscriptionFilterCommand({
        logGroupName: group,
        filterName: "errors",
        filterPattern: "ERROR",
        destinationArn: functionArn,
      }),
    );
    await sendTestEvent(group, "app", "ERROR to lambda");
    await sendTestEvent(group, "app", "INFO skip");

    const received = await waitFor("receiver to log the event", async () => {
      const messages = await messagesMatching(`/aws/lambda/${receiver}`, "got").catch(() => []);
      return messages.some((message) => message?.includes("ERROR to lambda"))
        ? messages
        : undefined;
    });
    expect(received.join("\n")).not.toContain("INFO skip");
  });

  it("delivers matching events to a Kinesis stream as gzipped JSON", async () => {
    await kinesis.send(new CreateStreamCommand({ StreamName: stream, ShardCount: 1 }));
    const arn = await waitFor("stream to be active", async () => {
      const { StreamDescriptionSummary } = await kinesis.send(
        new DescribeStreamSummaryCommand({ StreamName: stream }),
      );
      return StreamDescriptionSummary?.StreamStatus === "ACTIVE"
        ? StreamDescriptionSummary.StreamARN
        : undefined;
    });
    const group = await newGroup();
    await logs.send(
      new PutSubscriptionFilterCommand({
        logGroupName: group,
        filterName: "errors",
        filterPattern: "ERROR",
        destinationArn: arn,
      }),
    );
    await sendTestEvent(group, "app", "ERROR to kinesis");
    await sendTestEvent(group, "app", "INFO skip");

    const { Shards = [] } = await kinesis.send(new ListShardsCommand({ StreamName: stream }));
    const { ShardIterator } = await kinesis.send(
      new GetShardIteratorCommand({
        StreamName: stream,
        ShardId: Shards[0]?.ShardId,
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const messages = await waitFor("records to arrive", async () => {
      const { Records = [] } = await kinesis.send(new GetRecordsCommand({ ShardIterator }));
      const found = Records.flatMap(
        (record) =>
          JSON.parse(gunzipSync(Buffer.from(record.Data ?? [])).toString()).logEvents.map(
            (logEvent: { message: string }) => logEvent.message,
          ) as string[],
      );
      return found.length ? found : undefined;
    });
    expect(messages).toEqual(["ERROR to kinesis"]);
  });

  // Lệch AWS: AWS cho tối đa 2 filter mỗi group, Floci 2.4.0 nhận cả filter thứ ba (spec 7 #12)
  it("accepts a third subscription filter AWS refuses", async () => {
    const { FunctionArn = "" } = await lambda
      .send(new GetFunctionCommand({ FunctionName: receiver }))
      .then((result) => result.Configuration ?? {});
    const group = await newGroup();
    const put = (filterName: string) =>
      logs.send(
        new PutSubscriptionFilterCommand({
          logGroupName: group,
          filterName,
          filterPattern: "",
          destinationArn: FunctionArn,
        }),
      );
    await put("one");
    await put("two");
    await expect(put("three")).resolves.toBeDefined();
  });
});
