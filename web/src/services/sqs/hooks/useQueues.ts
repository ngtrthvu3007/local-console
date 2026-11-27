import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isQueueMissing,
  type CreateQueueInput,
  type Queue,
  type QueueSettings,
  type RedrivePolicy,
  type SqsService,
  AUTO_REFRESH_INTERVAL_MS,
} from "@localconsole/core/sqs";
import { existsQuery } from "@shared/aws.ts";
import { useSqsService } from "./useSqsService.ts";

const SQS_QUERY_ROOT = "sqs";
const queuesQueryKey = [SQS_QUERY_ROOT, "queues"];
const anyQueueQueryKey = [SQS_QUERY_ROOT, "queue"];
export const queueQueryKey = (queue: string, part?: string) =>
  part ? [...anyQueueQueryKey, queue, part] : [...anyQueueQueryKey, queue];
const DETAILS = "details";
const DLQ_SOURCES = "dlq-sources";

// Nơi khác tham chiếu tới queue (S3 rule, SNS subscription, DLQ…) còn trỏ được không.
// Query option dùng chung: trang service khác truyền facade SQS của nó
export const queueExistsQuery = (sqs: Pick<SqsService, "getQueue">, name: string) =>
  existsQuery(queueQueryKey(name, "exists"), () => sqs.getQueue(name), isQueueMissing);

export function useQueueExists(name: string) {
  const sqs = useSqsService();
  return useQuery(queueExistsQuery(sqs, name));
}

const refreshEvery = (autoRefresh: boolean) => (autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false);

export function useQueues() {
  const sqs = useSqsService();

  return useQuery({ queryKey: queuesQueryKey, queryFn: sqs.listQueues });
}

export function useQueue(name: string, autoRefresh = false) {
  const sqs = useSqsService();

  return useQuery({
    queryKey: queueQueryKey(name, DETAILS),
    queryFn: () => sqs.getQueue(name),
    retry: false,
    refetchInterval: refreshEvery(autoRefresh),
  });
}

export function useDeadLetterSources(queue: Queue) {
  const sqs = useSqsService();

  return useQuery({
    queryKey: queueQueryKey(queue.name, DLQ_SOURCES),
    queryFn: () => sqs.listDeadLetterSources(queue),
  });
}

export function useInvalidateQueue() {
  const queryClient = useQueryClient();

  return (queue: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queueQueryKey(queue) }),
      queryClient.invalidateQueries({ queryKey: queuesQueryKey }),
    ]);
}

export function useCreateQueue() {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (input: CreateQueueInput) => sqs.createQueue(input),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteQueues() {
  const sqs = useSqsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queues: readonly Queue[]) => sqs.deleteQueues(queues),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queuesQueryKey }),
  });
}

export function useUpdateSettings(queue: Queue) {
  const sqs = useSqsService();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (settings: QueueSettings) => sqs.updateSettings(queue, settings),
    onSuccess: () => invalidate(queue.name),
  });
}

export function useUpdateRedrivePolicy(queue: Queue) {
  const sqs = useSqsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policy?: RedrivePolicy) => sqs.updateRedrivePolicy(queue, policy),
    // Khối "DLQ of" của queue đích cũng đổi, nên làm mới mọi query của SQS
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SQS_QUERY_ROOT] }),
  });
}
