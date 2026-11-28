import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DeleteEmailIdentityCommand, SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { CONSOLE_URL, consoleConfig, deleteMails, uniqueName, viaConsole } from "./helpers.ts";

// MCP của console gọi bằng JSON-RPC qua fetch, như client theo spec 2025 (nhánh stateless của SDK)
const PROTOCOL_VERSION = "2025-06-18";
const LONG_HTML_LENGTH = 25_000;
const MAX_TEXT_CHARS = 20_000;

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, any>;
}

let requestId = 0;

async function rpc(method: string, params: object, query = "") {
  const response = await fetch(`${CONSOLE_URL}/mcp${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  });
  const text = await response.text();
  // SDK trả SSE (một dòng data:) hoặc JSON tùy request
  const data = text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(data ? data.slice("data: ".length) : text);
}

const toolNames = async (query = "") =>
  ((await rpc("tools/list", {}, query)).result.tools as { name: string }[]).map(
    (tool) => tool.name,
  );

async function call(name: string, args: object = {}, query = ""): Promise<ToolResult> {
  const body = await rpc("tools/call", { name, arguments: args }, query);
  return body.result ?? { isError: true, content: [{ type: "text", text: body.error.message }] };
}

// Gọi tool phải thành công; lỗi thì hiện câu báo của tool cho dễ đọc
async function data(name: string, args: object = {}) {
  const result = await call(name, args);
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return result.structuredContent!;
}

let region: string;

beforeAll(async () => {
  region = (await consoleConfig()).region;
});

describe("tools/list", () => {
  it("has every tool of the first batch, without reset", async () => {
    const names = await toolNames();
    expect(names).toHaveLength(1 + 11 + 13);
    expect(names).toContain("floci_read_status");
    expect(names).not.toContain("floci_reset_data");
  });

  it("keeps only read tools with read_only=true", async () => {
    expect(await toolNames("?read_only=true")).toEqual([
      "floci_read_status",
      "sqs_read_queue",
      "sqs_peek_message",
      "ses_read_email",
      "ses_read_identity",
      "ses_read_template",
      "ses_read_configuration_set",
    ]);
  });

  it("refuses a write tool that read_only=true left out", async () => {
    const result = await call("sqs_delete_queue", { names: ["x"] }, "?read_only=true");
    expect(result.isError).toBe(true);
  });
});

describe("floci", () => {
  it("reads Floci status", async () => {
    const status = await data("floci_read_status");
    expect(status.services.sqs).toBeDefined();
    expect(status.consoleUrl).toBe(`${CONSOLE_URL}/`);
  });
});

describe("SQS lifecycle", () => {
  const name = uniqueName("mcp");
  const sqs = () => new SQSClient(viaConsole(region));

  afterAll(() => call("sqs_delete_queue", { names: [name] }));

  it("creates a queue and returns the same queue the console reads", async () => {
    const created = await data("sqs_create_queue", { name });
    expect(created.consoleUrl).toBe(`${CONSOLE_URL}/sqs/queues/${name}`);

    // Khớp UI: cùng queue đọc qua proxy /aws của console
    const { QueueUrl } = await sqs().send(new GetQueueUrlCommand({ QueueName: name }));
    const { Attributes } = await sqs().send(
      new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["All"] }),
    );
    const queue = await data("sqs_read_queue", { method: "get", name });
    expect(queue).toMatchObject({
      name,
      url: QueueUrl,
      arn: Attributes!.QueueArn,
      fifo: false,
      settings: { visibilityTimeout: Number(Attributes!.VisibilityTimeout) },
    });
  });

  it("sends, peeks, polls and deletes a message", async () => {
    const { messageId } = await data("sqs_send_message", { queue: name, body: "hello from mcp" });
    const peeked = await data("sqs_peek_message", { queue: name });
    expect(peeked.items.map((message: { MessageId: string }) => message.MessageId)).toContain(
      messageId,
    );

    const { messages } = await data("sqs_poll_message", { queue: name });
    expect(messages[0]).toMatchObject({ MessageId: messageId, Body: "hello from mcp" });
    const deleted = await data("sqs_delete_message", {
      queue: name,
      messages: [{ MessageId: messageId, ReceiptHandle: messages[0].ReceiptHandle }],
    });
    expect(deleted.count).toBe(1);
  });

  it("updates settings, purges and deletes the queue", async () => {
    const updated = await data("sqs_update_queue", {
      name,
      settings: { visibilityTimeout: "45" },
    });
    expect(updated.settings.visibilityTimeout).toBe(45);

    await data("sqs_send_message", { queue: name, body: "to purge" });
    await data("sqs_purge_queue", { name });
    await data("sqs_delete_queue", { names: [name] });

    const missing = await call("sqs_read_queue", { method: "get", name });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/does not exist/i);
  });
});

describe("SES lifecycle", () => {
  const sender = `${uniqueName("mcp")}@example.com`;
  const ses = () => new SESv2Client(viaConsole(region));

  afterAll(async () => {
    await deleteMails((mail) => mail.Source === sender);
    await ses()
      .send(new DeleteEmailIdentityCommand({ EmailIdentity: sender }))
      .catch(() => undefined);
  });

  it("reads a long email an app sent, cut with a link to the console", async () => {
    await data("ses_create_identity", { email: sender });
    const identity = await data("ses_read_identity", { method: "get", name: sender });
    expect(identity.IdentityName).toBe(sender);

    await ses().send(
      new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: ["to@example.com"] },
        Content: {
          Simple: {
            Subject: { Data: "long mail" },
            Body: { Html: { Data: `<p>${"a".repeat(LONG_HTML_LENGTH)}</p>` } },
          },
        },
      }),
    );

    const list = await data("ses_read_email", { method: "list", search: sender });
    expect(list.items).toHaveLength(1);
    const id = list.items[0].Id;
    expect(list.items[0]).not.toHaveProperty("Body");

    const email = await data("ses_read_email", { method: "get", id });
    expect(email.subject).toBe("long mail");
    expect(email.html.text).toHaveLength(MAX_TEXT_CHARS);
    expect(email.html.truncated).toBe(true);
    expect(email.consoleUrl).toBe(`${CONSOLE_URL}/ses/mailbox?email=${id}`);

    await data("ses_delete_email", { id });
    expect((await data("ses_read_email", { method: "list", search: sender })).items).toEqual([]);
  });

  it("says when an identity doesn't exist, then deletes the real one", async () => {
    const missing = await call("ses_read_identity", { method: "get", name: "nobody@example.com" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("doesn't exist");

    expect((await data("ses_delete_identity", { names: [sender] })).count).toBe(1);
  });
});
