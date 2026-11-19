import { describe, expect, it } from "vitest";
import {
  createSubscriptionSchema,
  createTopicSchema,
  publishSchema,
} from "../../../src/services/sns/schemas.ts";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("createTopicSchema", () => {
  const check = (type: "standard" | "fifo", name: string) =>
    createTopicSchema.safeParse({ type, name, contentBasedDedup: false });

  it("accepts valid names", () => {
    expect(check("standard", "order-events_v2").success).toBe(true);
    expect(check("fifo", "payments.fifo").success).toBe(true);
  });

  it("enforces the .fifo suffix both ways", () => {
    expect(firstMessage(check("fifo", "payments"))).toMatch(/must end with \.fifo/);
    expect(firstMessage(check("standard", "payments.fifo"))).toMatch(/Only FIFO/);
  });

  it("rejects other characters and names over 256 characters", () => {
    expect(check("standard", "orders.v2").success).toBe(false);
    expect(check("standard", "a".repeat(257)).success).toBe(false);
    expect(check("standard", "a".repeat(256)).success).toBe(true);
  });
});

describe("createSubscriptionSchema", () => {
  const base = {
    protocol: "sqs" as const,
    queueArn: "",
    functionArn: "",
    url: "",
    rawDelivery: false,
    filterPolicy: "",
    filterScope: "MessageAttributes" as const,
  };
  const check = (changes: Partial<typeof base>) =>
    createSubscriptionSchema.safeParse({ ...base, ...changes });

  it("needs the endpoint of the chosen protocol", () => {
    expect(firstMessage(check({}))).toBe("Choose a queue.");
    expect(check({ queueArn: "arn:aws:sqs:r:0:q" }).success).toBe(true);
    expect(firstMessage(check({ protocol: "lambda" }))).toBe("Choose a function.");
  });

  it("checks that an HTTP URL has the matching scheme", () => {
    expect(check({ protocol: "http", url: "http://host.docker.internal:3000/x" }).success).toBe(
      true,
    );
    expect(check({ protocol: "https", url: "http://host:3000" }).success).toBe(false);
    expect(check({ protocol: "http", url: "not a url" }).success).toBe(false);
  });

  it("reports a broken filter policy", () => {
    expect(
      firstMessage(check({ queueArn: "arn:aws:sqs:r:0:q", filterPolicy: "{oops" })),
    ).toMatch(/Invalid JSON/);
  });
});

describe("publishSchema", () => {
  const standard = { fifo: false, contentBasedDedup: false };
  const fifo = { fifo: true, contentBasedDedup: false };
  const message = { subject: "", body: "hi", attributes: [], groupId: "", dedupId: "" };
  const attribute = { name: "type", type: "String" as const, value: "order" };

  it("needs a body", () => {
    expect(firstMessage(publishSchema(standard).safeParse({ ...message, body: " " }))).toBe(
      "Enter a message body.",
    );
    expect(publishSchema(standard).safeParse(message).success).toBe(true);
  });

  it("checks attribute names, values and number type", () => {
    const check = (attributes: (typeof attribute)[]) =>
      publishSchema(standard).safeParse({ ...message, attributes });
    expect(check([attribute]).success).toBe(true);
    expect(check([{ ...attribute, name: "" }]).success).toBe(false);
    expect(check([attribute, attribute]).success).toBe(false);
    expect(check([{ name: "n", type: "Number", value: "abc" }]).success).toBe(false);
    expect(check([{ name: "n", type: "Number", value: "4.5" }]).success).toBe(true);
  });

  it("stops at 10 attributes", () => {
    const attributes = Array.from({ length: 11 }, (_unused, index) => ({
      ...attribute,
      name: `a${index}`,
    }));
    expect(publishSchema(standard).safeParse({ ...message, attributes }).success).toBe(false);
  });

  it("needs a group ID on FIFO, and a dedup ID unless content-based", () => {
    expect(publishSchema(fifo).safeParse(message).error?.issues.map((issue) => issue.path[0])).toEqual(
      ["groupId", "dedupId"],
    );
    const contentBased = publishSchema({ fifo: true, contentBasedDedup: true });
    expect(contentBased.safeParse({ ...message, groupId: "g" }).success).toBe(true);
  });
});
