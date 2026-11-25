import type { QueueAttributeName } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { DETAIL_SEPARATOR, KIBIBYTE, MILLISECONDS_PER_SECOND } from "@shared/constants.ts";
import { ATTRIBUTE_TRUE, QUEUE_TYPES } from "./constants.ts";

const URL_PATH_SEPARATOR = "/";

type QueueAttributes = Partial<Record<QueueAttributeName, string>>;

export interface QueueSettings {
  visibilityTimeout: number; // giây
  delay: number; // giây
  retention: number; // giây
  maxMessageSize: number; // byte
  receiveWait: number; // giây
  contentBasedDedup: boolean;
}

export interface Queue {
  name: string;
  url: string;
  arn: string;
  fifo: boolean;
  available: number;
  inFlight: number;
  delayed: number;
  created?: Date;
  modified?: Date;
  settings: QueueSettings;
  // Không nằm trong settings: tab Settings ghi lại settings, còn mã hóa chỉ đặt lúc tạo
  encryption: { kmsKeyId?: string; sqsManaged: boolean };
  redrivePolicy?: RedrivePolicy;
}

// "http://localhost:4566/000000000000/orders" → "orders"
export const queueNameOfUrl = (url: string) => url.split(URL_PATH_SEPARATOR).pop() ?? url;

// URL của queue theo host khác (vd: floci:4566 cho app chạy trong compose), giữ nguyên đường dẫn
export const queueUrlAt = (base: string, queueUrl: string) =>
  `${base}${new URL(queueUrl).pathname}`;

const numberOf = (value?: string) => Number(value ?? 0);
// Timestamp của SQS tính bằng giây
const dateOf = (seconds?: string) =>
  seconds ? new Date(Number(seconds) * MILLISECONDS_PER_SECOND) : undefined;

// maxReceiveCount có thể là số hoặc chuỗi tùy nơi tạo policy (SDK, CLI, IaC)
const redrivePolicySchema = z.object({
  deadLetterTargetArn: z.string().min(1),
  maxReceiveCount: z.coerce.number(),
});

export type RedrivePolicy = z.infer<typeof redrivePolicySchema>;

export function parseRedrivePolicy(text?: string): RedrivePolicy | undefined {
  if (!text) return undefined;

  try {
    return redrivePolicySchema.safeParse(JSON.parse(text)).data;
  } catch {
    return undefined;
  }
}

export function toQueue(url: string, attributes: QueueAttributes): Queue {
  return {
    name: queueNameOfUrl(url),
    url,
    arn: attributes.QueueArn ?? "",
    fifo: attributes.FifoQueue === ATTRIBUTE_TRUE,
    available: numberOf(attributes.ApproximateNumberOfMessages),
    inFlight: numberOf(attributes.ApproximateNumberOfMessagesNotVisible),
    delayed: numberOf(attributes.ApproximateNumberOfMessagesDelayed),
    created: dateOf(attributes.CreatedTimestamp),
    modified: dateOf(attributes.LastModifiedTimestamp),
    settings: {
      visibilityTimeout: numberOf(attributes.VisibilityTimeout),
      delay: numberOf(attributes.DelaySeconds),
      retention: numberOf(attributes.MessageRetentionPeriod),
      maxMessageSize: numberOf(attributes.MaximumMessageSize),
      receiveWait: numberOf(attributes.ReceiveMessageWaitTimeSeconds),
      contentBasedDedup: attributes.ContentBasedDeduplication === ATTRIBUTE_TRUE,
    },
    redrivePolicy: parseRedrivePolicy(attributes.RedrivePolicy),
    encryption: {
      kmsKeyId: attributes.KmsMasterKeyId,
      sqsManaged: attributes.SqsManagedSseEnabled === ATTRIBUTE_TRUE,
    },
  };
}

// Queue Standard không nhận attribute ContentBasedDeduplication
export function settingsToAttributes(settings: QueueSettings, fifo: boolean): QueueAttributes {
  return {
    VisibilityTimeout: String(settings.visibilityTimeout),
    DelaySeconds: String(settings.delay),
    MessageRetentionPeriod: String(settings.retention),
    MaximumMessageSize: String(settings.maxMessageSize),
    ReceiveMessageWaitTimeSeconds: String(settings.receiveWait),
    ...(fifo && { ContentBasedDeduplication: String(settings.contentBasedDedup) }),
  };
}

// Tắt DLQ = gửi chuỗi rỗng
export const redrivePolicyAttribute = (policy?: RedrivePolicy) =>
  policy ? JSON.stringify(policy) : "";

export const bytesToKiB = (bytes: number) => bytes / KIBIBYTE;
export const kiBToBytes = (kiB: number) => kiB * KIBIBYTE;

export const queueTypeLabel = (queue: Queue) => QUEUE_TYPES[queue.fifo ? "fifo" : "standard"];

// "12 available · 1 in flight · 0 delayed"
export const messageCountsText = (queue: Queue) =>
  [
    `${queue.available.toLocaleString()} available`,
    `${queue.inFlight.toLocaleString()} in flight`,
    `${queue.delayed.toLocaleString()} delayed`,
  ].join(DETAIL_SEPARATOR);
