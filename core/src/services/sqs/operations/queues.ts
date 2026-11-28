import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListDeadLetterSourceQueuesCommand,
  paginateListDeadLetterSourceQueues,
  paginateListQueues,
  QueueDoesNotExist,
  SetQueueAttributesCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { awsManagedAlias } from "#services/kms/keys.ts";
import {
  ALL_ATTRIBUTES,
  ATTRIBUTE_TRUE,
  QUEUE_ENCRYPTION,
  SQS_KEY_SERVICE,
  type QueueEncryption,
  type QueueType,
} from "#services/sqs/constants.ts";
import {
  queueNameOfUrl,
  redrivePolicyAttribute,
  settingsToAttributes,
  toQueue,
  type Queue,
  type QueueSettings,
  type RedrivePolicy,
} from "#services/sqs/queues.ts";

export interface CreateQueueInput {
  name: string;
  type: QueueType;
  contentBasedDedup: boolean;
  encryption: QueueEncryption;
  kmsKeyId: string;
}

// JSON protocol trả lỗi này với mã 400, isNotFoundError dùng chung không nhận ra
export const isQueueMissing = (error: unknown) => error instanceof QueueDoesNotExist;

async function describeQueue(sqs: SQSClient, url: string) {
  const { Attributes = {} } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: [ALL_ATTRIBUTES] }),
  );

  return toQueue(url, Attributes);
}

export async function listQueues(sqs: SQSClient) {
  const urls = await collectPages(
    paginateListQueues({ client: sqs }, {}),
    (page) => page.QueueUrls,
  );
  // Local ít queue nên đọc attribute từng queue song song
  return Promise.all(urls.map((url) => describeQueue(sqs, url)));
}

// Đường dẫn dùng tên queue; URL lấy bằng GetQueueUrl, không tự ghép host
export async function getQueue(sqs: SQSClient, name: string) {
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
  return describeQueue(sqs, QueueUrl!);
}

export async function listDeadLetterSources(sqs: SQSClient, queue: Queue) {
  const paginator = paginateListDeadLetterSourceQueues({ client: sqs }, { QueueUrl: queue.url });
  return (await collectPages(paginator, (page) => page.queueUrls)).map(queueNameOfUrl);
}

// Có queue nào đang dùng queue này làm DLQ không (cảnh báo khi xóa): chỉ đọc trang đầu
export const isDeadLetterQueue = async (sqs: SQSClient, queue: Queue) =>
  Boolean(
    (await sqs.send(new ListDeadLetterSourceQueuesCommand({ QueueUrl: queue.url }))).queueUrls
      ?.length,
  );

export const createQueue = (
  sqs: SQSClient,
  { name, type, contentBasedDedup, encryption, kmsKeyId }: CreateQueueInput,
) =>
  sqs.send(
    new CreateQueueCommand({
      QueueName: name,
      Attributes: {
        ...(type === "fifo"
          ? { FifoQueue: ATTRIBUTE_TRUE, ContentBasedDeduplication: String(contentBasedDedup) }
          : {}),
        ...(encryption === QUEUE_ENCRYPTION.sseKms
          ? { KmsMasterKeyId: kmsKeyId || awsManagedAlias(SQS_KEY_SERVICE) }
          : { SqsManagedSseEnabled: ATTRIBUTE_TRUE }),
      },
    }),
  );

export const deleteQueues = (sqs: SQSClient, queues: readonly Queue[]) =>
  runEach(
    queues,
    (queue) => queue.name,
    (queue) => sqs.send(new DeleteQueueCommand({ QueueUrl: queue.url })),
  );

export const updateSettings = (sqs: SQSClient, queue: Queue, settings: QueueSettings) =>
  sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queue.url,
      Attributes: settingsToAttributes(settings, queue.fifo),
    }),
  );

// undefined = tắt DLQ
export const updateRedrivePolicy = (sqs: SQSClient, queue: Queue, policy?: RedrivePolicy) =>
  sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queue.url,
      Attributes: { RedrivePolicy: redrivePolicyAttribute(policy) },
    }),
  );
