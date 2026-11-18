import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ListDeadLetterSourceQueuesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
  StartMessageMoveTaskCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { AWS_PROXY_URL, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các luồng của trang SQS: peek qua endpoint riêng của Floci, poll → DLQ → redrive

const queueName = uniqueName("queue");
const dlqName = uniqueName("dlq");
const fifoName = `${uniqueName("fifo")}.fifo`;
const MAX_RECEIVES = 2;

let region: string;
let sqs: SQSClient;
let queueUrl: string;
let dlqUrl: string;
let fifoUrl: string;

const arnOf = async (url: string) =>
  (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] })))
    .Attributes!.QueueArn!;

const availableIn = async (url: string) =>
  Number(
    (
      await sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: url,
          AttributeNames: ["ApproximateNumberOfMessages"],
        }),
      )
    ).Attributes!.ApproximateNumberOfMessages,
  );

// Giống web/src/services/sqs/peek.ts: Floci chỉ đọc region trong header, không kiểm chữ ký
async function peek(url: string, withRegion = true): Promise<Message[]> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const headers: Record<string, string> = withRegion
    ? {
        Authorization: `AWS4-HMAC-SHA256 Credential=test/${day}/${region}/sqs/aws4_request, SignedHeaders=host, Signature=unsigned`,
      }
    : {};
  const response = await fetch(
    `${AWS_PROXY_URL}/_aws/sqs/messages?${new URLSearchParams({ QueueUrl: url })}`,
    { headers },
  );
  if (!response.ok) throw new Error(`peek ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { messages?: Message[] }).messages ?? [];
}

beforeAll(async () => {
  region = (await consoleConfig()).region;
  sqs = new SQSClient(viaConsole(region));
  dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: dlqName }))).QueueUrl!;
  queueUrl = (
    await sqs.send(
      new CreateQueueCommand({
        QueueName: queueName,
        // Visibility 1 giây để message quay lại ngay giữa hai lần poll
        Attributes: {
          VisibilityTimeout: "1",
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: await arnOf(dlqUrl),
            maxReceiveCount: MAX_RECEIVES,
          }),
        },
      }),
    )
  ).QueueUrl!;
  fifoUrl = (
    await sqs.send(
      new CreateQueueCommand({
        QueueName: fifoName,
        Attributes: { FifoQueue: "true", ContentBasedDeduplication: "true" },
      }),
    )
  ).QueueUrl!;
});

afterAll(async () => {
  for (const url of [queueUrl, dlqUrl, fifoUrl].filter(Boolean)) {
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => undefined);
  }
});

describe("SQS through the console proxy", () => {
  it("peeks without changing the queue", async () => {
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: '{"orderId":42}' }));
    for (let round = 0; round < 3; round++) {
      const messages = await peek(queueUrl);
      expect(messages).toHaveLength(1);
      expect(messages[0].Attributes?.ApproximateReceiveCount).toBe("0");
    }
    expect(await availableIn(queueUrl)).toBe(1);
  });

  it("needs the region header to find the queue", async () => {
    await expect(peek(queueUrl, false)).rejects.toThrow();
  });

  it("moves a message to the DLQ after max receives, then redrives it back", async () => {
    for (let receive = 0; receive < MAX_RECEIVES; receive++) {
      await waitFor("message to be visible again", async () => {
        const { Messages } = await sqs.send(
          new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
        );
        return Messages?.length ? true : undefined;
      });
    }
    await waitFor("message in the DLQ", async () => {
      await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }));
      return (await availableIn(dlqUrl)) === 1 ? true : undefined;
    });

    const { queueUrls } = await sqs.send(
      new ListDeadLetterSourceQueuesCommand({ QueueUrl: dlqUrl }),
    );
    expect(queueUrls).toEqual([queueUrl]);

    await sqs.send(new StartMessageMoveTaskCommand({ SourceArn: await arnOf(dlqUrl) }));
    await waitFor("message back in the source queue", async () =>
      (await availableIn(queueUrl)) === 1 ? true : undefined,
    );
    expect(await availableIn(dlqUrl)).toBe(0);
  });

  it("turns the DLQ off with an empty redrive policy", async () => {
    await sqs.send(
      new SetQueueAttributesCommand({ QueueUrl: queueUrl, Attributes: { RedrivePolicy: "" } }),
    );
    const { Attributes } = await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["RedrivePolicy"] }),
    );
    expect(Attributes?.RedrivePolicy ?? "").toBe("");
  });

  it("drops a duplicate FIFO message and shows the group ID when peeking", async () => {
    for (let copy = 0; copy < 2; copy++) {
      await sqs.send(
        new SendMessageCommand({ QueueUrl: fifoUrl, MessageBody: "same", MessageGroupId: "g1" }),
      );
    }
    const messages = await peek(fifoUrl);
    expect(messages).toHaveLength(1);
    expect(messages[0].Attributes?.MessageGroupId).toBe("g1");
  });

  it("rejects a FIFO message without a group ID", async () => {
    await expect(
      sqs.send(new SendMessageCommand({ QueueUrl: fifoUrl, MessageBody: "no group" })),
    ).rejects.toMatchObject({ name: "MissingParameter" });
  });
});
