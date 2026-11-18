import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DeleteMessageCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  StartMessageMoveTaskCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  ALL_ATTRIBUTES,
  AUTO_REFRESH_INTERVAL_MS,
  POLL_MAX_MESSAGES,
  POLL_WAIT_SECONDS,
} from "../constants.ts";
import { peekMessages } from "../peek.ts";
import type { Queue } from "../queues.ts";
import { queueQueryKey, useInvalidateQueue } from "./useQueues.ts";
import { useSQS } from "./useSQS.ts";

const PEEK = "peek";

export function usePeek(queue: Queue, autoRefresh: boolean) {
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: queueQueryKey(queue.name, PEEK),
    queryFn: () => peekMessages(queue.url, region),
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });
}

// Nhận như một consumer: message bị ẩn trong visibility timeout và tăng số lần nhận
export function usePoll(queue: Queue) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: async () =>
      (
        await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queue.url,
            MaxNumberOfMessages: POLL_MAX_MESSAGES,
            WaitTimeSeconds: POLL_WAIT_SECONDS,
            MessageSystemAttributeNames: [ALL_ATTRIBUTES],
            MessageAttributeNames: [ALL_ATTRIBUTES],
          }),
        )
      ).Messages ?? [],
    onSuccess: () => invalidate(queue.name),
  });
}

// Chỉ xóa được message vừa poll (cần receipt handle)
export function useDeleteMessages(queue: Queue) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: async (messages: readonly Message[]) => {
      const failures: string[] = [];
      const deleted: string[] = [];
      for (const message of messages) {
        try {
          await client.send(
            new DeleteMessageCommand({ QueueUrl: queue.url, ReceiptHandle: message.ReceiptHandle }),
          );
          deleted.push(message.MessageId!);
        } catch (error) {
          failures.push(`${message.MessageId}: ${errorMessage(error)}`);
        }
      }
      return { count: deleted.length, deleted, failures };
    },
    onSuccess: () => invalidate(queue.name),
  });
}

export interface SendMessageInput {
  body: string;
  groupId: string;
  dedupId: string;
}

export function useSendMessage(queue: Queue) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ body, groupId, dedupId }: SendMessageInput) =>
      client.send(
        new SendMessageCommand({
          QueueUrl: queue.url,
          MessageBody: body,
          // Queue Standard không nhận hai trường này
          MessageGroupId: queue.fifo ? groupId : undefined,
          MessageDeduplicationId: queue.fifo && dedupId ? dedupId : undefined,
        }),
      ),
    onSuccess: () => invalidate(queue.name),
  });
}

export function usePurge(queue: Queue) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: () => client.send(new PurgeQueueCommand({ QueueUrl: queue.url })),
    onSuccess: () => invalidate(queue.name),
  });
}

// Không truyền đích: từng message về lại queue gốc của nó
export function useStartRedrive(queue: Queue, sources: string[]) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: () => client.send(new StartMessageMoveTaskCommand({ SourceArn: queue.arn })),
    onSuccess: () => Promise.all([queue.name, ...sources].map(invalidate)),
  });
}
