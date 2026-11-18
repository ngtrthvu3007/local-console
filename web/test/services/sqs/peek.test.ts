import { describe, expect, it } from "vitest";
import { peekAuthorization, peekUrl } from "../../../src/services/sqs/peek.ts";

const QUEUE_URL = "http://localhost:4566/000000000000/orders";

describe("peekAuthorization", () => {
  it("names the region in the credential scope, which is all Floci reads", () => {
    const header = peekAuthorization("ap-southeast-1", new Date("2026-11-17T10:20:01Z"));
    expect(header).toContain("Credential=test/20261117/ap-southeast-1/sqs/aws4_request");
    expect(header.startsWith("AWS4-HMAC-SHA256 ")).toBe(true);
  });
});

describe("peekUrl", () => {
  it("goes through the console proxy and encodes the queue URL", () => {
    expect(peekUrl(QUEUE_URL)).toBe(
      `/aws/_aws/sqs/messages?QueueUrl=${encodeURIComponent(QUEUE_URL)}`,
    );
  });
});
