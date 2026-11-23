import { describe, expect, it } from "vitest";
import { tableSample } from "../../src/services/dynamodb/codeSamples.ts";
import { brokerUrl } from "../../src/services/mq/codeSamples.ts";
import { bucketSample } from "../../src/services/s3/codeSamples.ts";
import { senderOf } from "../../src/services/ses/codeSamples.ts";
import { queueSample } from "../../src/services/sqs/codeSamples.ts";
import type { Queue } from "../../src/services/sqs/queues.ts";

const queue = (fifo: boolean, contentBasedDedup: boolean) =>
  ({
    url: "http://localhost.floci.io:4566/000000000000/orders.fifo",
    fifo,
    settings: { contentBasedDedup },
  }) as Queue;

describe("code samples", () => {
  it("adds FIFO fields only when the queue needs them", () => {
    const standard = queueSample(queue(false, false));
    expect(standard.node).not.toContain("MessageGroupId");
    const deduped = queueSample(queue(true, true));
    expect(deduped.python).toContain("MessageGroupId=");
    expect(deduped.python).not.toContain("MessageDeduplicationId");
    const fifo = queueSample(queue(true, false));
    expect(fifo.node).toContain("MessageDeduplicationId: crypto.randomUUID()");
    expect(fifo.python).toContain("import uuid");
  });

  it("uses path-style S3 in both languages", () => {
    const sample = bucketSample("my-bucket");
    expect(sample.node).toContain("forcePathStyle: true");
    expect(sample.python).toContain('"addressing_style": "path"');
  });

  it("fills the table's own key names and types", () => {
    const sample = tableSample("orders", [
      { name: "pk", type: "S" },
      { name: "sk", type: "N" },
    ]);

    expect(sample.node).toContain('const Key = { "pk": "example", "sk": 1 };');
    expect(sample.python).toContain('key = { "pk": "example", "sk": 1 }');
  });

  it("escapes names into valid string literals", () => {
    expect(bucketSample('a"b').node).toContain('const Bucket = "a\\"b";');
  });

  it("sends from an address of a domain identity", () => {
    expect(senderOf("dev@app.local")).toBe("dev@app.local");
    expect(senderOf("app.local")).toBe("noreply@app.local");
  });

  it("leaves user and password to fill in the AMQP URL", () => {
    expect(brokerUrl("amqp://172.28.0.4:5672")).toBe("amqp://USER:PASSWORD@172.28.0.4:5672");
  });
});
