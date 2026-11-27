import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  isShardOpen,
  gunzipIfGzip,
  recordText,
  streamNameOfArn,
} from "#services/kinesis/recordData.ts";
import {
  createStreamSchema,
  dataViewerSchema,
  putRecordSchema,
} from "#services/kinesis/schemas.ts";
import { kinesisRoutes, STREAM_TABS } from "#services/kinesis/paths.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("recordText", () => {
  it("shows JSON on one line, text as is, other bytes as binary", () => {
    expect(recordText(bytes('{ "event": "click",\n "page": "/" }'))).toEqual({
      kind: "json",
      text: '{"event":"click","page":"/"}',
    });
    expect(recordText(bytes("Xin chào Việt Nam 🇻🇳"))).toEqual({
      kind: "text",
      text: "Xin chào Việt Nam 🇻🇳",
    });
    expect(recordText(new Uint8Array([0xff, 0xfe, 0x00, 0x81, 0x92]))).toEqual({
      kind: "binary",
      text: "Binary (5 bytes)",
    });
    expect(recordText(undefined)).toEqual({ kind: "text", text: "" });
  });

  it("keeps a bare number or string as text, not JSON", () => {
    expect(recordText(bytes("42")).kind).toBe("text");
    expect(recordText(bytes('"hi"')).kind).toBe("text");
  });
});

describe("stream and shard helpers", () => {
  it("reads the stream name from its ARN", () => {
    expect(streamNameOfArn("arn:aws:kinesis:ap-southeast-1:000000000000:stream/clicks")).toBe(
      "clicks",
    );
  });

  it("treats a shard without an ending sequence number as open", () => {
    expect(isShardOpen({ SequenceNumberRange: { StartingSequenceNumber: "0" } })).toBe(true);
    expect(
      isShardOpen({
        SequenceNumberRange: { StartingSequenceNumber: "0", EndingSequenceNumber: "9" },
      }),
    ).toBe(false);
  });
});

describe("schemas", () => {
  const stream = { name: "orders.events-1", mode: "ON_DEMAND", shards: "1" } as const;

  it("blocks stream names Floci would accept but AWS rejects", () => {
    expect(createStreamSchema.safeParse(stream).success).toBe(true);
    expect(createStreamSchema.safeParse({ ...stream, name: "bad name!" }).success).toBe(false);
    expect(createStreamSchema.safeParse({ ...stream, name: "a".repeat(129) }).success).toBe(false);
    expect(createStreamSchema.safeParse({ ...stream, name: "" }).success).toBe(false);
  });

  it("checks the shard count only for provisioned streams", () => {
    expect(createStreamSchema.safeParse({ ...stream, shards: "0" }).success).toBe(true);
    expect(
      createStreamSchema.safeParse({ ...stream, mode: "PROVISIONED", shards: "0" }).success,
    ).toBe(false);
    expect(createStreamSchema.parse({ ...stream, mode: "PROVISIONED", shards: "3" }).shards).toBe(
      3,
    );
  });

  it("counts the record size in UTF-8 bytes", () => {
    const schema = putRecordSchema(4);
    expect(schema.safeParse({ partitionKey: "k", data: "éé" }).success).toBe(true);
    expect(schema.safeParse({ partitionKey: "k", data: "ééé" }).success).toBe(false);
    expect(schema.safeParse({ partitionKey: "k", data: "" }).success).toBe(false);
    expect(schema.safeParse({ partitionKey: "", data: "a" }).success).toBe(false);
    expect(schema.safeParse({ partitionKey: "k".repeat(257), data: "a" }).success).toBe(false);
  });

  it("needs a valid timestamp only for At timestamp", () => {
    const view = { shardId: "shardId-000000000000", position: "LATEST", timestamp: "" } as const;
    expect(dataViewerSchema.safeParse(view).success).toBe(true);
    expect(dataViewerSchema.safeParse({ ...view, position: "AT_TIMESTAMP" }).success).toBe(false);
    expect(
      dataViewerSchema.safeParse({ ...view, position: "AT_TIMESTAMP", timestamp: "not a date" })
        .success,
    ).toBe(false);
    expect(
      dataViewerSchema.safeParse({
        ...view,
        position: "AT_TIMESTAMP",
        timestamp: "2026-11-25 20:37:58",
      }).success,
    ).toBe(true);
  });
});

describe("kinesisRoutes", () => {
  it("keeps the default tab off the URL", () => {
    expect(kinesisRoutes.stream("clicks")).toBe("/kinesis/streams/clicks");
    expect(kinesisRoutes.stream("clicks", STREAM_TABS.dataViewer)).toBe("/kinesis/streams/clicks");
    expect(kinesisRoutes.stream("clicks", STREAM_TABS.configuration)).toBe(
      "/kinesis/streams/clicks?tab=configuration",
    );
  });
});

// Subscription filter của CloudWatch Logs gửi record gzip JSON (spec Logs 3.9)
describe("gunzipIfGzip", () => {
  it("decompresses gzip records and leaves other bytes alone", async () => {
    const json = '{"logEvents":[{"message":"ERROR boom"}]}';
    const gz = new Uint8Array(gzipSync(json));
    expect(new TextDecoder().decode(await gunzipIfGzip(gz))).toBe(json);
    const plain = new TextEncoder().encode('{"a":1}');
    expect(await gunzipIfGzip(plain)).toBe(plain);
    const broken = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);
    expect(await gunzipIfGzip(broken)).toBe(broken);
  });
});
