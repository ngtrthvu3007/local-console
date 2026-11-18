import {
  AWS_PROXY_PATH,
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
} from "@shared/constants.ts";

export const KIBIBYTE = 1024;

// Luật đặt tên queue của SQS: 1–80 ký tự (tính cả đuôi .fifo)
export const QUEUE_NAME_MAX_LENGTH = 80;
export const QUEUE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const FIFO_SUFFIX = ".fifo";

export const QUEUE_TYPES = { standard: "Standard", fifo: "FIFO" } as const;
export type QueueType = keyof typeof QUEUE_TYPES;

// SQS trả mọi attribute dạng chuỗi
export const ATTRIBUTE_TRUE = "true";
export const ALL_ATTRIBUTES = "All";

// Giới hạn của SetQueueAttributes
export const SETTING_LIMITS = {
  visibilityTimeout: { min: 0, max: 12 * SECONDS_PER_HOUR },
  delay: { min: 0, max: 900 },
  retention: { min: 60, max: 14 * SECONDS_PER_DAY },
  maxMessageSizeKiB: { min: 1, max: 1024 },
  receiveWait: { min: 0, max: 20 },
} as const;
export const MAX_RECEIVE_COUNT = { min: 1, max: 1000, default: 3 } as const;

// Poll giả lập consumer: tối đa 10 message (giới hạn của ReceiveMessage), long polling 5 giây
export const POLL_MAX_MESSAGES = 10;
export const POLL_WAIT_SECONDS = 5;

export const AUTO_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

// Endpoint riêng của Floci, không có trên AWS: xem message mà không lấy mất
export const PEEK_PATH = `${AWS_PROXY_PATH}/_aws/sqs/messages`;
export const PEEK_QUEUE_URL_PARAM = "QueueUrl";
export const SIGNING_SERVICE = "sqs";

// Bảng message chỉ hiện phần đầu của ID và body
export const MESSAGE_ID_PREVIEW_LENGTH = 8;
export const BODY_PREVIEW_LENGTH = 80;
export const BODY_EDITOR_HEIGHT_PX = 200;

// System attribute của message
export const MESSAGE_ATTRIBUTES = {
  sent: "SentTimestamp",
  receiveCount: "ApproximateReceiveCount",
} as const;
