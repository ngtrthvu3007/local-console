import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListDeadLetterSourceQueuesCommand } from "@aws-sdk/client-sqs";
import {
  ListEventSourceMappingsCommand,
  paginateListEventSourceMappings,
  type EventSourceMappingConfiguration,
} from "@aws-sdk/client-lambda";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { createQueueTrigger, type QueueTriggerInput } from "../../lambda/hooks/useTriggers.ts";
import type { Queue } from "../queues.ts";
import { queueQueryKey } from "./useQueues.ts";
import { useSQS } from "./useSQS.ts";

const TRIGGERS = "triggers";
const LINKS = "links";

// Các Lambda đang đọc queue
export function useQueueTriggers(queue: Queue) {
  const { lambda } = useLambda();

  return useQuery({
    queryKey: queueQueryKey(queue.name, TRIGGERS),
    queryFn: async () => {
      const mappings: EventSourceMappingConfiguration[] = [];

      const paginator = paginateListEventSourceMappings(
        { client: lambda },
        { EventSourceArn: queue.arn },
      );

      for await (const page of paginator) mappings.push(...(page.EventSourceMappings ?? []));
      return mappings;
    },
  });
}

export function useAddQueueTrigger(queue: Queue) {
  const { lambda } = useLambda();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<QueueTriggerInput, "queueArn">) =>
      createQueueTrigger(lambda, { ...input, queueArn: queue.arn }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queueQueryKey(queue.name, TRIGGERS) }),
  });
}

interface QueueLinks {
  withTriggers: string[];
  deadLetterQueues: string[]; // queue đang là DLQ của queue khác
}

// Để cảnh báo khi xóa: chỉ cần biết có hay không, nên mỗi queue chỉ đọc trang đầu
export function useQueueLinks(queues: readonly Queue[]) {
  const { lambda } = useLambda();
  const sqs = useSQS();

  return useQuery({
    queryKey: queueQueryKey(queues.map((queue) => queue.name).join(), LINKS),
    queryFn: async (): Promise<QueueLinks> => {
      const checks = await Promise.all(
        queues.map(async (queue) => {
          const [mappings, sources] = await Promise.all([
            lambda.send(new ListEventSourceMappingsCommand({ EventSourceArn: queue.arn })),
            sqs.send(new ListDeadLetterSourceQueuesCommand({ QueueUrl: queue.url })),
          ]);

          return {
            name: queue.name,
            triggered: Boolean(mappings.EventSourceMappings?.length),
            deadLetter: Boolean(sources.queueUrls?.length),
          };
        }),
      );

      return {
        withTriggers: checks.filter((check) => check.triggered).map((check) => check.name),
        deadLetterQueues: checks.filter((check) => check.deadLetter).map((check) => check.name),
      };
    },
  });
}
