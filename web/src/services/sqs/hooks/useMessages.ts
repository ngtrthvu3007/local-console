import { useMutation, useQuery } from "@tanstack/react-query";
import type { Message } from "@aws-sdk/client-sqs";
import {
  type Queue,
  type SendMessageInput,
  AUTO_REFRESH_INTERVAL_MS,
} from "@localconsole/core/sqs";
import { queueQueryKey, useInvalidateQueue } from "./useQueues.ts";
import { useSqsService } from "./useSqsService.ts";

const PEEK = "peek";

export function usePeek(queue: Queue, autoRefresh: boolean) {
  const sqs = useSqsService();

  return useQuery({
    queryKey: queueQueryKey(queue.name, PEEK),
    queryFn: () => sqs.peekMessages(queue),
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });
}

export function usePoll(queue: Queue) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: () => sqs.pollMessages(queue),
    onSuccess: () => invalidate(queue.name),
  });
}

export function useDeleteMessages(queue: Queue) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (messages: readonly Message[]) => sqs.deleteMessages(queue, messages),
    onSuccess: () => invalidate(queue.name),
  });
}

export function useSendMessage(queue: Queue) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (input: SendMessageInput) => sqs.sendMessage(queue, input),
    onSuccess: () => invalidate(queue.name),
  });
}

export function usePurge(queue: Queue) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: () => sqs.purgeQueue(queue),
    onSuccess: () => invalidate(queue.name),
  });
}

export function useStartRedrive(queue: Queue, sources: string[]) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: () => sqs.startRedrive(queue),
    onSuccess: () => Promise.all([queue.name, ...sources].map(invalidate)),
  });
}
