import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  paginateListDeadLetterSourceQueues,
  paginateListQueues,
  QueueDoesNotExist,
  SetQueueAttributesCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { existsUnlessMissing } from "@shared/aws.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  QUEUE_ENCRYPTION,
  SQS_DEFAULT_KEY_ID,
  type QueueEncryption,
  ALL_ATTRIBUTES,
  ATTRIBUTE_TRUE,
  AUTO_REFRESH_INTERVAL_MS,
  type QueueType,
} from "../constants.ts";
import {
  queueNameOfUrl,
  redrivePolicyAttribute,
  settingsToAttributes,
  toQueue,
  type Queue,
  type QueueSettings,
  type RedrivePolicy,
} from "../queues.ts";
import { useSQS } from "./useSQS.ts";

// Mọi query của SQS nằm dưới key gốc này
const SQS_QUERY_ROOT = "sqs";
const queuesQueryKey = [SQS_QUERY_ROOT, "queues"];
// Mọi query về một queue (chi tiết, message, trigger…) nằm dưới key này
const anyQueueQueryKey = [SQS_QUERY_ROOT, "queue"];
export const queueQueryKey = (queue: string, part?: string) =>
  part ? [...anyQueueQueryKey, queue, part] : [...anyQueueQueryKey, queue];
const DETAILS = "details";
const DLQ_SOURCES = "dlq-sources";

// JSON protocol trả lỗi này với mã 400, isNotFoundError dùng chung không nhận ra
export const isQueueMissing = (error: unknown) => error instanceof QueueDoesNotExist;

// Nơi khác tham chiếu tới queue (S3 rule, SNS subscription, DLQ…) còn trỏ được không
export const queueExistsQuery = (client: SQSClient, name: string) => ({
  queryKey: queueQueryKey(name, "exists"),
  queryFn: () =>
    existsUnlessMissing(
      () => client.send(new GetQueueUrlCommand({ QueueName: name })),
      isQueueMissing,
    ),
  retry: false,
});

export function useQueueExists(name: string) {
  const client = useSQS();
  return useQuery(queueExistsQuery(client, name));
}

const refreshEvery = (autoRefresh: boolean) => (autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false);

async function describeQueue(client: SQSClient, url: string) {
  const { Attributes = {} } = await client.send(
    new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: [ALL_ATTRIBUTES] }),
  );

  return toQueue(url, Attributes);
}

export function useQueues() {
  const client = useSQS();

  return useQuery({
    queryKey: queuesQueryKey,
    queryFn: async () => {
      const urls: string[] = [];
      for await (const page of paginateListQueues({ client }, {}))
        urls.push(...(page.QueueUrls ?? []));
      // Local ít queue nên đọc attribute từng queue song song
      return Promise.all(urls.map((url) => describeQueue(client, url)));
    },
  });
}

// Đường dẫn dùng tên queue; URL lấy bằng GetQueueUrl, không tự ghép host
export function useQueue(name: string, autoRefresh = false) {
  const client = useSQS();

  return useQuery({
    queryKey: queueQueryKey(name, DETAILS),
    queryFn: async () => {
      const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName: name }));
      return describeQueue(client, QueueUrl!);
    },
    retry: false,
    refetchInterval: refreshEvery(autoRefresh),
  });
}

// Các queue đang dùng queue này làm DLQ
export function useDeadLetterSources(queue: Queue) {
  const client = useSQS();

  return useQuery({
    queryKey: queueQueryKey(queue.name, DLQ_SOURCES),
    queryFn: async () => {
      const names: string[] = [];
      const paginator = paginateListDeadLetterSourceQueues({ client }, { QueueUrl: queue.url });
      for await (const page of paginator) names.push(...(page.queueUrls ?? []).map(queueNameOfUrl));
      return names;
    },
  });
}

// Làm mới mọi query của queue và danh sách; trả promise để nút giữ loading tới khi dữ liệu mới về
export function useInvalidateQueue() {
  const queryClient = useQueryClient();

  return (queue: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queueQueryKey(queue) }),
      queryClient.invalidateQueries({ queryKey: queuesQueryKey }),
    ]);
}

export interface CreateQueueInput {
  name: string;
  type: QueueType;
  contentBasedDedup: boolean;
  encryption: QueueEncryption;
  kmsKeyId: string;
}

// Thông số còn lại để mặc định của SQS, sửa sau ở tab Settings
export function useCreateQueue() {
  const client = useSQS();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: ({ name, type, contentBasedDedup, encryption, kmsKeyId }: CreateQueueInput) =>
      client.send(
        new CreateQueueCommand({
          QueueName: name,
          Attributes: {
            ...(type === "fifo"
              ? { FifoQueue: ATTRIBUTE_TRUE, ContentBasedDeduplication: String(contentBasedDedup) }
              : {}),
            ...(encryption === QUEUE_ENCRYPTION.sseKms
              ? { KmsMasterKeyId: kmsKeyId || SQS_DEFAULT_KEY_ID }
              : { SqsManagedSseEnabled: ATTRIBUTE_TRUE }),
          },
        }),
      ),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteQueues() {
  const client = useSQS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (queues: readonly Queue[]) => {
      const failures: string[] = [];

      for (const queue of queues) {
        try {
          await client.send(new DeleteQueueCommand({ QueueUrl: queue.url }));
        } catch (error) {
          failures.push(`${queue.name}: ${errorMessage(error)}`);
        }
      }

      return { count: queues.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queuesQueryKey }),
  });
}

export function useUpdateSettings(queue: Queue) {
  const client = useSQS();
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (settings: QueueSettings) =>
      client.send(
        new SetQueueAttributesCommand({
          QueueUrl: queue.url,
          Attributes: settingsToAttributes(settings, queue.fifo),
        }),
      ),
    onSuccess: () => invalidate(queue.name),
  });
}

// undefined = tắt DLQ
export function useUpdateRedrivePolicy(queue: Queue) {
  const client = useSQS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policy?: RedrivePolicy) =>
      client.send(
        new SetQueueAttributesCommand({
          QueueUrl: queue.url,
          Attributes: { RedrivePolicy: redrivePolicyAttribute(policy) },
        }),
      ),
    // Khối "DLQ of" của queue đích cũng đổi, nên làm mới mọi query của SQS
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SQS_QUERY_ROOT] }),
  });
}
