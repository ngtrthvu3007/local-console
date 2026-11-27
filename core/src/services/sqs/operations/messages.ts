import {
  DeleteMessageCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  StartMessageMoveTaskCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import { ALL_ATTRIBUTES, POLL_MAX_MESSAGES, POLL_WAIT_SECONDS } from "#services/sqs/constants.ts";
import type { Queue } from "#services/sqs/queues.ts";

export interface SendMessageInput {
  body: string;
  groupId: string;
  dedupId: string;
}

// Nhận như một consumer: message bị ẩn trong visibility timeout và tăng số lần nhận
export const pollMessages = async (sqs: SQSClient, queue: Queue) =>
  (
    await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queue.url,
        MaxNumberOfMessages: POLL_MAX_MESSAGES,
        WaitTimeSeconds: POLL_WAIT_SECONDS,
        MessageSystemAttributeNames: [ALL_ATTRIBUTES],
        MessageAttributeNames: [ALL_ATTRIBUTES],
      }),
    )
  ).Messages ?? [];

// Chỉ xóa được message vừa poll (cần receipt handle)
export async function deleteMessages(sqs: SQSClient, queue: Queue, messages: readonly Message[]) {
  const failures: string[] = [];
  const deleted: string[] = [];

  for (const message of messages) {
    try {
      await sqs.send(
        new DeleteMessageCommand({ QueueUrl: queue.url, ReceiptHandle: message.ReceiptHandle }),
      );

      deleted.push(message.MessageId!);
    } catch (error) {
      failures.push(`${message.MessageId}: ${errorMessage(error)}`);
    }
  }

  return { count: deleted.length, deleted, failures };
}

export const sendMessage = (
  sqs: SQSClient,
  queue: Queue,
  { body, groupId, dedupId }: SendMessageInput,
) =>
  sqs.send(
    new SendMessageCommand({
      QueueUrl: queue.url,
      MessageBody: body,
      // Queue Standard không nhận hai trường này
      MessageGroupId: queue.fifo ? groupId : undefined,
      MessageDeduplicationId: queue.fifo && dedupId ? dedupId : undefined,
    }),
  );

export const purgeQueue = (sqs: SQSClient, queue: Queue) =>
  sqs.send(new PurgeQueueCommand({ QueueUrl: queue.url }));

// Không truyền đích: từng message về lại queue gốc của nó
export const startRedrive = (sqs: SQSClient, queue: Queue) =>
  sqs.send(new StartMessageMoveTaskCommand({ SourceArn: queue.arn }));
