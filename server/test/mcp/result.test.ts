import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fail, FLOCI_DOWN_MESSAGE, ok, page, truncateText } from "../../src/mcp/result.ts";

const textOf = (result: ReturnType<typeof fail>) =>
  result.content.map((block) => (block.type === "text" ? block.text : "")).join();

describe("truncateText", () => {
  it("cuts long text and says so", () => {
    const result = truncateText("a".repeat(20_001));
    expect(result.text).toHaveLength(20_000);
    expect(result.truncated).toBe(true);
  });

  it("keeps short text", () => {
    expect(truncateText("hello")).toEqual({ text: "hello", truncated: false });
  });
});

describe("page", () => {
  const items = Array.from({ length: 120 }, (_, index) => index);

  it("returns one page and the offset of the next", () => {
    const first = page(items, 50);
    expect(first.items).toHaveLength(50);
    expect(first.nextToken).toBe("50");
  });

  it("has no nextToken on the last page", () => {
    const last = page(items, 50, "100");
    expect(last.items).toEqual(items.slice(100));
    expect(last).not.toHaveProperty("nextToken");
  });
});

describe("ok", () => {
  it("returns structured content with the console URL and the same JSON as text", () => {
    const result = ok({ a: 1, at: new Date(0) }, "http://localhost:3701/sqs/queues/q");
    expect(result.structuredContent).toEqual({
      a: 1,
      at: "1970-01-01T00:00:00.000Z",
      consoleUrl: "http://localhost:3701/sqs/queues/q",
    });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });
});

describe("fail", () => {
  it("tells how to start Floci when the SDK can't connect", () => {
    const result = fail(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(FLOCI_DOWN_MESSAGE);
    expect(textOf(result)).toContain("docker compose up -d floci");
  });

  it("finds the connection error inside fetch's cause (AggregateError for localhost)", () => {
    const cause = Object.assign(new AggregateError([{ code: "ECONNREFUSED" }]), { code: "" });
    expect(textOf(fail(new TypeError("fetch failed", { cause })))).toBe(FLOCI_DOWN_MESSAGE);
  });

  it("shows an AWS error like the console flashbar", () => {
    const error = Object.assign(new Error("The specified queue does not exist."), {
      name: "QueueDoesNotExist",
    });
    expect(textOf(fail(error))).toBe("QueueDoesNotExist: The specified queue does not exist.");
  });

  it("shows the form message of a zod error", () => {
    const error = z.object({ name: z.string().min(1, "Enter a queue name.") }).safeParse({
      name: "",
    }).error;
    expect(textOf(fail(error))).toContain("Enter a queue name.");
  });
});
