import { AWS_PROXY_PATH, MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

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

// Hộp thư SMS của Floci dùng chung mọi region (spec SMS 7 #1)
export const SMS_INBOX_PATH = `${AWS_PROXY_PATH}/_aws/sns`;
export const SMS_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;
export const SMS_TYPE_ATTRIBUTE = "AWS.SNS.SMS.SMSType";
export const SMS_TYPES = ["Transactional", "Promotional"] as const;
export type SmsType = (typeof SMS_TYPES)[number];
export const DEFAULT_SMS_TYPE: SmsType = "Transactional";
// E.164: dấu +, chữ số đầu khác 0, tối đa 15 chữ số
export const PHONE_NUMBER_PATTERN = /^\+[1-9]\d{1,14}$/;
export const PHONE_NUMBER_EXAMPLE = "+84900000111";
// Hiển thị số di động Việt Nam theo nhóm dễ đọc; số E.164 khác giữ nguyên.
export const VIETNAM_MOBILE_NUMBER_PATTERN = /^\+84(\d{3})(\d{3})(\d{3})$/;
export const VIETNAM_MOBILE_NUMBER_FORMAT = "+84 $1 $2 $3";

export const EDITOR_HEIGHT_PX = 200;
// Cột Filter chỉ hiện phần đầu của policy
export const FILTER_SUMMARY_MAX_LENGTH = 40;
export const ENDPOINT_PREVIEW_LENGTH = 48;

// Floci chỉ gọi tới host trong container; localhost là chính Floci
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;
export const HOST_FROM_CONTAINER = "host.docker.internal";

// URL trỏ localhost: gọi từ trong container Floci sẽ về chính Floci (SNS HTTP, IdP OIDC của Cognito)
export function isLocalUrl(text: string): boolean {
  try {
    return LOCAL_HOSTS.some((host) => host === new URL(text).hostname);
  } catch {
    return false;
  }
}

// Tên service trong alias key AWS managed; bật mã hóa mà không chọn key thì dùng alias này
export const SNS_KEY_SERVICE = "sns";
export const SNS_DEFAULT_KEY_ID = "alias/aws/sns";
