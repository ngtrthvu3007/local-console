import { describe, expect, it } from "vitest";
import { createQueueSchema, deadLetterSchema, sendMessageSchema } from "#services/sqs/schemas.ts";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("createQueueSchema", () => {
  const check = (type: "standard" | "fifo", name: string) =>
    createQueueSchema.safeParse({
      type,
      name,
      contentBasedDedup: false,
      encryption: "sse-sqs",
      kmsKeyId: "",
    });

  it("accepts valid names", () => {
    expect(check("standard", "orders_v2-dlq").success).toBe(true);
    expect(check("fifo", "payments.fifo").success).toBe(true);
  });

  it("enforces the .fifo suffix both ways", () => {
    expect(firstMessage(check("fifo", "payments"))).toMatch(/must end with \.fifo/);
    expect(firstMessage(check("standard", "payments.fifo"))).toMatch(/Only FIFO/);
  });

  it("rejects other characters and names over 80 characters", () => {
    expect(check("standard", "orders.v2").success).toBe(false);
    expect(check("standard", "a".repeat(81)).success).toBe(false);
    expect(check("standard", "a".repeat(80)).success).toBe(true);
  });
});

describe("sendMessageSchema", () => {
  const fifo = { fifo: true, contentBasedDedup: false, maxMessageSize: 4 };

  it("requires group ID, and dedup ID unless content-based dedup is on", () => {
    const result = sendMessageSchema(fifo).safeParse({ body: "hi", groupId: "", dedupId: "" });
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(["groupId", "dedupId"]);
    expect(
      sendMessageSchema({ ...fifo, contentBasedDedup: true }).safeParse({
        body: "hi",
        groupId: "g",
        dedupId: "",
      }).success,
    ).toBe(true);
  });

  it("limits the body to the queue's max message size in bytes", () => {
    const standard = { ...fifo, fifo: false };
    // "é" là 2 byte UTF-8: 3 ký tự = 6 byte > 4
    expect(
      sendMessageSchema(standard).safeParse({ body: "ééé", groupId: "", dedupId: "" }).success,
    ).toBe(false);
    expect(
      sendMessageSchema(standard).safeParse({ body: "abcd", groupId: "", dedupId: "" }).success,
    ).toBe(true);
  });
});

describe("deadLetterSchema", () => {
  it("checks the queue and receive count only when turned on", () => {
    expect(
      deadLetterSchema.safeParse({ enabled: false, deadLetterTargetArn: "", maxReceiveCount: "" })
        .success,
    ).toBe(true);
    const result = deadLetterSchema.safeParse({
      enabled: true,
      deadLetterTargetArn: "",
      maxReceiveCount: "1001",
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "deadLetterTargetArn",
      "maxReceiveCount",
    ]);
  });
});

describe("createQueueSchema encryption", () => {
  it("takes SSE-SQS or SSE-KMS with a key ARN", () => {
    const base = { type: "standard", name: "orders", contentBasedDedup: false };
    expect(
      createQueueSchema.safeParse({ ...base, encryption: "sse-sqs", kmsKeyId: "" }).success,
    ).toBe(true);
    expect(
      createQueueSchema.safeParse({ ...base, encryption: "sse-kms", kmsKeyId: "k1" }).success,
    ).toBe(false);
  });
});
