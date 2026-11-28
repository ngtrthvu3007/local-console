import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddQueueTriggerInput, Queue } from "@localconsole/core/sqs";
import { queueQueryKey } from "./useQueues.ts";
import { useSqsService } from "./useSqsService.ts";

const TRIGGERS = "triggers";
const LINKS = "links";

export function useQueueTriggers(queue: Queue) {
  const sqs = useSqsService();

  return useQuery({
    queryKey: queueQueryKey(queue.name, TRIGGERS),
    queryFn: () => sqs.listTriggers(queue),
  });
}

export function useAddQueueTrigger(queue: Queue) {
  const sqs = useSqsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddQueueTriggerInput) => sqs.addTrigger(queue, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queueQueryKey(queue.name, TRIGGERS) }),
  });
}

export function useQueueLinks(queues: readonly Queue[]) {
  const sqs = useSqsService();

  return useQuery({
    queryKey: queueQueryKey(queues.map((queue) => queue.name).join(), LINKS),
    queryFn: () => sqs.listQueueLinks(queues),
  });
}
