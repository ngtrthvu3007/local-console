import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  ListStreamsCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
// Có sẵn qua mọi client AWS SDK (phụ thuộc chung), không khai báo riêng trong package.json
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Hành vi Kinesis của Floci mà trang Kinesis dựa vào, qua proxy /aws của console (spec Kinesis mục 7)

const HTTP_BAD_REQUEST = 400;
const PROVISIONED_SHARDS = 2;
const TRIGGER_BATCH_SIZE = 2;
// Trigger tắt: chờ chừng này mà function không chạy là đủ tin
const DISABLED_QUIET_MS = 10_000;
const BATCH_MARKER = "LC_IT_KINESIS_BATCH";
// Stream on-demand của Floci có một shard
const FIRST_SHARD = "shardId-000000000000";
const PAGE_LIMIT = 2;

// Ghi số record của batch và data đã giải mã, để test đếm theo log
const CONSUMER_SOURCE = `
export const handler = async (event) => {
  console.log("${BATCH_MARKER}", JSON.stringify(event.Records.map((record) =>
    Buffer.from(record.kinesis.data, "base64").toString("utf8"))));
};`;

let kinesis: KinesisClient;
let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
const onDemand = uniqueName("kinesis");
const provisioned = uniqueName("kinesis-prov");
const triggered = uniqueName("kinesis-trig");
const consumer = uniqueName("kinesis-fn");
let mappingId = "";

const streamArn = async (name: string) =>
  (await kinesis.send(new DescribeStreamSummaryCommand({ StreamName: name })))
    .StreamDescriptionSummary?.StreamARN ?? "";

const putRecord = (data: string) =>
  kinesis.send(
    new PutRecordCommand({ StreamName: triggered, PartitionKey: "pk", Data: strToU8(data) }),
  );

// Mỗi dòng log là một batch: mảng data của các record trong batch
const batches = async (): Promise<string[][]> =>
  (
    (
      await logs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${consumer}`,
          filterPattern: BATCH_MARKER,
        }),
      )
    ).events ?? []
  ).map((entry) => {
    const message = entry.message ?? "";
    return JSON.parse(message.slice(message.indexOf("[")));
  });

const waitForRecords = (description: string, data: string) =>
  waitFor(description, async () => {
    const found = await batches().catch(() => []);
    return found.some((batch) => batch.includes(data)) ? found : undefined;
  });

beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  // SDK Kinesis trên Node mặc định HTTP/2, proxy /aws của console chỉ nói HTTP/1.1 (gọi thẳng Floci thì được) (spec 7 #13)
  kinesis = new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() });
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);

  await kinesis.send(
    new CreateStreamCommand({
      StreamName: onDemand,
      StreamModeDetails: { StreamMode: "ON_DEMAND" },
    }),
  );
  for (const [name, shards] of [
    [provisioned, PROVISIONED_SHARDS],
    [triggered, 1],
  ] as const) {
    await kinesis.send(
      new CreateStreamCommand({
        StreamName: name,
        ShardCount: shards,
        StreamModeDetails: { StreamMode: "PROVISIONED" },
      }),
    );
  }
});

afterAll(async () => {
  if (mappingId)
    await lambda
      .send(new DeleteEventSourceMappingCommand({ UUID: mappingId }))
      .catch(() => undefined);
  await lambda.send(new DeleteFunctionCommand({ FunctionName: consumer })).catch(() => undefined);
  await logs
    .send(new DeleteLogGroupCommand({ logGroupName: `/aws/lambda/${consumer}` }))
    .catch(() => undefined);
  for (const name of [onDemand, provisioned, triggered]) {
    await kinesis
      .send(new DeleteStreamCommand({ StreamName: name, EnforceConsumerDeletion: true }))
      .catch(() => undefined);
  }
});

const openShards = async (name: string) =>
  (await kinesis.send(new DescribeStreamSummaryCommand({ StreamName: name })))
    .StreamDescriptionSummary?.OpenShardCount;

describe("streams", () => {
  it("lists both streams with their capacity mode", async () => {
    const { StreamSummaries = [] } = await kinesis.send(new ListStreamsCommand({}));
    const modes = Object.fromEntries(
      StreamSummaries.map((stream) => [stream.StreamName, stream.StreamModeDetails?.StreamMode]),
    );
    expect(modes[onDemand]).toBe("ON_DEMAND");
    expect(modes[provisioned]).toBe("PROVISIONED");
  });

  it("counts open shards in the summary", async () => {
    expect(await openShards(onDemand)).toBe(1);
    expect(await openShards(provisioned)).toBe(PROVISIONED_SHARDS);
  });

  it("rejects a duplicate name", async () => {
    await expect(
      kinesis.send(
        new CreateStreamCommand({
          StreamName: onDemand,
          StreamModeDetails: { StreamMode: "ON_DEMAND" },
        }),
      ),
    ).rejects.toMatchObject({ name: "ResourceInUseException" });
  });

  // 400 chứ không phải 404: trình duyệt ghi console.error, nên E2E không mở stream không có
  it("answers a missing stream with ResourceNotFoundException and HTTP 400", async () => {
    await expect(
      kinesis.send(new DescribeStreamSummaryCommand({ StreamName: uniqueName("kinesis-missing") })),
    ).rejects.toMatchObject({
      name: "ResourceNotFoundException",
      $metadata: { httpStatusCode: HTTP_BAD_REQUEST },
    });
  });
});

// Data viewer (spec 3.4): đọc theo iterator, trang theo Limit + NextShardIterator
describe("records", () => {
  const put = (data: string) =>
    kinesis.send(
      new PutRecordCommand({ StreamName: onDemand, PartitionKey: "pk", Data: strToU8(data) }),
    );

  const iterator = async (type: "TRIM_HORIZON" | "LATEST" | "AT_TIMESTAMP", timestamp?: Date) =>
    (
      await kinesis.send(
        new GetShardIteratorCommand({
          StreamName: onDemand,
          ShardId: FIRST_SHARD,
          ShardIteratorType: type,
          Timestamp: timestamp,
        }),
      )
    ).ShardIterator ?? "";

  const strFromBytes = (bytes?: Uint8Array) => new TextDecoder().decode(bytes);

  const read = async (shardIterator: string) => {
    const { Records = [], NextShardIterator } = await kinesis.send(
      new GetRecordsCommand({ ShardIterator: shardIterator, Limit: PAGE_LIMIT }),
    );
    return { data: Records.map((record) => strFromBytes(record.Data)), next: NextShardIterator };
  };

  it("pages from Trim horizon with Limit and NextShardIterator", async () => {
    for (const data of ["p1", "p2", "p3"]) await put(data);

    const first = await read(await iterator("TRIM_HORIZON"));
    expect(first.data).toEqual(["p1", "p2"]);
    const second = await read(first.next ?? "");
    expect(second.data).toEqual(["p3"]);
    // Hết record vẫn có iterator để đọc tiếp
    const third = await read(second.next ?? "");
    expect(third.data).toEqual([]);
    expect(third.next).toBeTruthy();
  });

  // Console để mở Next records sau lần đọc Latest rỗng (review 2026-11-25)
  it("reads nothing from Latest, then the records put after it", async () => {
    const latest = await read(await iterator("LATEST"));
    expect(latest.data).toEqual([]);

    await put("after-latest");
    expect((await read(latest.next ?? "")).data).toEqual(["after-latest"]);
  });

  it("reads from a timestamp only the records that arrived after it", async () => {
    const since = new Date();
    await put("after-timestamp");
    const { data } = await read(await iterator("AT_TIMESTAMP", since));
    expect(data).toEqual(["after-timestamp"]);
  });
});

// Các bước nối tiếp nhau: cùng một function, trigger và stream
describe("Lambda trigger", () => {
  it("delivers records put before the trigger from Trim horizon, in batches", async () => {
    for (const data of ["r1", "r2", "r3"]) await putRecord(data);

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: consumer,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: { ZipFile: zipSync({ "index.mjs": strToU8(CONSUMER_SOURCE) }) },
        Timeout: 30,
      }),
    );
    await waitFor(`${consumer} to be Active`, async () => {
      const { Configuration } = await lambda.send(
        new GetFunctionCommand({ FunctionName: consumer }),
      );
      return Configuration?.State === "Active" ? true : undefined;
    });
    mappingId =
      (
        await lambda.send(
          new CreateEventSourceMappingCommand({
            FunctionName: consumer,
            EventSourceArn: await streamArn(triggered),
            StartingPosition: "TRIM_HORIZON",
            BatchSize: TRIGGER_BATCH_SIZE,
          }),
        )
      ).UUID ?? "";

    const found = await waitForRecords("records r1–r3", "r3");
    expect(found.flat()).toEqual(expect.arrayContaining(["r1", "r2", "r3"]));
    expect(Math.max(...found.map((batch) => batch.length))).toBe(TRIGGER_BATCH_SIZE);
  });

  it("lists the trigger by the stream ARN only", async () => {
    const byStream = await lambda.send(
      new ListEventSourceMappingsCommand({ EventSourceArn: await streamArn(triggered) }),
    );
    const byOther = await lambda.send(
      new ListEventSourceMappingsCommand({ EventSourceArn: await streamArn(provisioned) }),
    );
    expect(byStream.EventSourceMappings?.map((mapping) => mapping.UUID)).toEqual([mappingId]);
    expect(byOther.EventSourceMappings).toEqual([]);
  });

  it("holds records while disabled and delivers them once enabled", async () => {
    await lambda.send(new UpdateEventSourceMappingCommand({ UUID: mappingId, Enabled: false }));
    await putRecord("r-held");
    await new Promise((resolve) => setTimeout(resolve, DISABLED_QUIET_MS));
    expect((await batches()).flat()).not.toContain("r-held");

    await lambda.send(new UpdateEventSourceMappingCommand({ UUID: mappingId, Enabled: true }));
    await waitForRecords("held record after enabling", "r-held");
  });

  // Floci không dọn trigger theo stream (spec 7 #11): console cảnh báo khi xóa, link hiện "(not found)"
  it("keeps the trigger after its stream is deleted", async () => {
    const arn = await streamArn(triggered);
    await kinesis.send(
      new DeleteStreamCommand({ StreamName: triggered, EnforceConsumerDeletion: true }),
    );
    const { EventSourceMappings = [] } = await lambda.send(
      new ListEventSourceMappingsCommand({ FunctionName: consumer }),
    );
    expect(EventSourceMappings.map((mapping) => mapping.EventSourceArn)).toContain(arn);
  });
});
