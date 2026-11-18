import { describe, expect, it } from "vitest";
import {
  parseRedrivePolicy,
  queueNameOfArn,
  queueNameOfUrl,
  queueUrlAt,
  redrivePolicyAttribute,
  settingsToAttributes,
  toQueue,
} from "../../../src/services/sqs/queues.ts";

const QUEUE_URL = "http://localhost:4566/000000000000/orders.fifo";
const DLQ_ARN = "arn:aws:sqs:ap-southeast-1:000000000000:orders-dlq";

describe("queue names", () => {
  it("reads the name from a URL and an ARN", () => {
    expect(queueNameOfUrl(QUEUE_URL)).toBe("orders.fifo");
    expect(queueNameOfArn(DLQ_ARN)).toBe("orders-dlq");
  });

  it("moves the URL to another host, keeping the path", () => {
    expect(queueUrlAt("http://floci:4566", QUEUE_URL)).toBe(
      "http://floci:4566/000000000000/orders.fifo",
    );
  });
});

describe("parseRedrivePolicy", () => {
  it("accepts maxReceiveCount as a number or a string", () => {
    const expected = { deadLetterTargetArn: DLQ_ARN, maxReceiveCount: 3 };
    expect(parseRedrivePolicy(JSON.stringify({ ...expected, maxReceiveCount: "3" }))).toEqual(
      expected,
    );
    expect(parseRedrivePolicy(JSON.stringify(expected))).toEqual(expected);
  });

  it("treats a missing or broken policy as no DLQ", () => {
    expect(parseRedrivePolicy(undefined)).toBeUndefined();
    expect(parseRedrivePolicy("")).toBeUndefined();
    expect(parseRedrivePolicy("{oops")).toBeUndefined();
  });

  it("turns a DLQ off with an empty string", () => {
    expect(redrivePolicyAttribute(undefined)).toBe("");
  });
});

describe("toQueue", () => {
  it("reads string attributes into numbers, flags and dates", () => {
    const queue = toQueue(QUEUE_URL, {
      QueueArn: "arn:aws:sqs:ap-southeast-1:000000000000:orders.fifo",
      FifoQueue: "true",
      ContentBasedDeduplication: "true",
      ApproximateNumberOfMessages: "12",
      ApproximateNumberOfMessagesNotVisible: "1",
      CreatedTimestamp: "1763374261",
      VisibilityTimeout: "30",
      MaximumMessageSize: "262144",
      RedrivePolicy: JSON.stringify({ deadLetterTargetArn: DLQ_ARN, maxReceiveCount: 2 }),
    });
    expect(queue).toMatchObject({
      name: "orders.fifo",
      fifo: true,
      available: 12,
      inFlight: 1,
      delayed: 0,
      settings: { visibilityTimeout: 30, maxMessageSize: 262144, contentBasedDedup: true },
      redrivePolicy: { deadLetterTargetArn: DLQ_ARN, maxReceiveCount: 2 },
    });
    expect(queue.created?.toISOString()).toBe("2025-11-17T10:11:01.000Z");
  });
});

describe("settingsToAttributes", () => {
  const settings = {
    visibilityTimeout: 1,
    delay: 0,
    retention: 60,
    maxMessageSize: 1024,
    receiveWait: 0,
    contentBasedDedup: true,
  };

  it("leaves content-based dedup out for a Standard queue", () => {
    expect(settingsToAttributes(settings, false)).not.toHaveProperty("ContentBasedDeduplication");
    expect(settingsToAttributes(settings, true).ContentBasedDeduplication).toBe("true");
  });
});
