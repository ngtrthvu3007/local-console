// Luật đặt tên topic của SNS: 1–256 ký tự (tính cả đuôi .fifo)
export const TOPIC_NAME_MAX_LENGTH = 256;
export const TOPIC_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const FIFO_SUFFIX = ".fifo";

export const TOPIC_TYPES = { standard: "Standard", fifo: "FIFO" } as const;
export type TopicType = keyof typeof TOPIC_TYPES;

export const PROTOCOLS = {
  sqs: "Amazon SQS",
  lambda: "AWS Lambda",
  http: "HTTP",
  https: "HTTPS",
} as const;
export type Protocol = keyof typeof PROTOCOLS;
// readonly string[]: protocol của subscription có thể là loại khác (email, sms…) tạo ngoài console
export const HTTP_PROTOCOLS: readonly string[] = ["http", "https"];
// Raw delivery chỉ có với SQS và HTTP(S)
export const RAW_DELIVERY_PROTOCOLS: readonly string[] = ["sqs", "http", "https"];

export const FILTER_SCOPES = {
  MessageAttributes: "Message attributes",
  MessageBody: "Message body",
} as const;
export type FilterScope = keyof typeof FILTER_SCOPES;
export const DEFAULT_FILTER_SCOPE: FilterScope = "MessageAttributes";

// Attribute của subscription
export const SUBSCRIPTION_ATTRIBUTES = {
  rawDelivery: "RawMessageDelivery",
  filterPolicy: "FilterPolicy",
  filterScope: "FilterPolicyScope",
  pending: "PendingConfirmation",
} as const;

// Message attribute khi publish: chỉ String và Number (giới hạn 10 của SNS)
export const ATTRIBUTE_DATA_TYPES = ["String", "Number"] as const;
export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];
export const MAX_MESSAGE_ATTRIBUTES = 10;

export const BODY_EDITOR_HEIGHT_PX = 200;
export const FILTER_EDITOR_HEIGHT_PX = 200;
// Cột Filter chỉ hiện phần đầu của policy
export const FILTER_SUMMARY_MAX_LENGTH = 40;
export const ENDPOINT_PREVIEW_LENGTH = 48;

// Floci chỉ gọi tới host trong container; localhost là chính Floci
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;
export const HOST_FROM_CONTAINER = "host.docker.internal";
