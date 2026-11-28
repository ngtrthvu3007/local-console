import { describe, expect, it } from "vitest";
import { SQS_TOOLS } from "../../src/mcp/tools/sqs.ts";

const tool = (name: string) => SQS_TOOLS.tools.find((candidate) => candidate.name === name)!;
const namesWith = (hint: "readOnlyHint" | "destructiveHint") =>
  SQS_TOOLS.tools.filter((candidate) => candidate.annotations[hint]).map((item) => item.name);
const messagesOf = (name: string, input: unknown) =>
  tool(name)
    .inputSchema.safeParse(input)
    .error?.issues.map((issue) => issue.message);

describe("SQS tools", () => {
  it("has the 11 tools of the spec", () => {
    expect(SQS_TOOLS.tools.map((item) => item.name)).toEqual([
      "sqs_read_queue",
      "sqs_peek_message",
      "sqs_create_queue",
      "sqs_update_queue",
      "sqs_delete_queue",
      "sqs_send_message",
      "sqs_poll_message",
      "sqs_delete_message",
      "sqs_purge_queue",
      "sqs_start_redrive",
      "sqs_add_trigger",
    ]);
  });

  it("marks read and destructive tools", () => {
    expect(namesWith("readOnlyHint")).toEqual(["sqs_read_queue", "sqs_peek_message"]);
    expect(namesWith("destructiveHint")).toEqual([
      "sqs_delete_queue",
      "sqs_delete_message",
      "sqs_purge_queue",
    ]);
    // Poll đổi visibility và receive count: ghi nhưng không xóa gì
    expect(tool("sqs_poll_message").annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it("readQueue rejects get without name", () => {
    expect(messagesOf("sqs_read_queue", { method: "get" })).toEqual([
      'Enter name for method "get".',
    ]);
    expect(messagesOf("sqs_read_queue", { method: "list" })).toBeUndefined();
  });

  it("checks create with the form schema and fills the form defaults", () => {
    expect(messagesOf("sqs_create_queue", { name: "" })).toEqual(["Enter a queue name."]);
    expect(messagesOf("sqs_create_queue", { name: "orders.fifo" })).toEqual([
      "Only FIFO queue names end with .fifo.",
    ]);
    expect(tool("sqs_create_queue").inputSchema.parse({ name: "orders" })).toEqual({
      name: "orders",
      type: "standard",
      contentBasedDedup: false,
      encryption: "sse-sqs",
      kmsKeyId: "",
    });
  });

  it("checks a trigger like the Add trigger form (batch size turns into a number)", () => {
    expect(
      tool("sqs_add_trigger").inputSchema.parse({ queue: "q", functionName: "f" }),
    ).toMatchObject({ queue: "q", functionName: "f", batchSize: 10, enabled: true });
    expect(
      messagesOf("sqs_add_trigger", { queue: "q", functionName: "f", batchSize: "99" }),
    ).toEqual(["Enter a whole number from 1 to 10 messages."]);
  });

  it("needs something to change on update", () => {
    expect(messagesOf("sqs_update_queue", { name: "q" })).toEqual([
      "Send settings, deadLetter or both.",
    ]);
    expect(messagesOf("sqs_update_queue", { name: "q", deadLetter: { enabled: true } })).toEqual([
      "Choose a queue.",
    ]);
  });
});
