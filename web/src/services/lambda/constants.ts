import type { Runtime } from "@aws-sdk/client-lambda";
import {
  FLOCI_ACCOUNT_ID,
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@shared/constants.ts";

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 * KIBIBYTE;

// Chỉ hỗ trợ Node.js và Python (sửa code ngay trên trang được), mới trước cũ.
// Function runtime khác (deploy bằng tool khác) vẫn xem, test, cấu hình được
export const RUNTIMES = [
  "nodejs24.x",
  "nodejs22.x",
  "python3.14",
  "python3.13",
  "python3.12",
  "python3.11",
] as const satisfies readonly Runtime[];
export const DEFAULT_RUNTIME: Runtime = "nodejs22.x";
export const RUNTIME_OPTIONS = RUNTIMES.map((runtime) => ({ value: runtime, label: runtime }));

// Giới hạn của Lambda API
export const FUNCTION_NAME_MAX_LENGTH = 64;
export const FUNCTION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const DESCRIPTION_MAX_LENGTH = 256;
export const MEMORY_LIMITS_MB = { min: 128, max: 10240, default: 128 } as const;
export const TIMEOUT_LIMITS_SECONDS = { min: 1, max: 900, default: 3 } as const;
export const MEGABYTE_UNIT = "MB";
export const PACKAGE_TYPE_ZIP = "Zip";
// Giống AWS Console: gói lớn hơn thì không sửa trên trang
export const INLINE_EDIT_MAX_BYTES = 3 * MEBIBYTE;

// Floci bắt buộc có Role nhưng không kiểm tra role có tồn tại không
export const DEFAULT_ROLE_ARN = `arn:aws:iam::${FLOCI_ACCOUNT_ID}:role/lambda-role`;

export const LOG_GROUP_PREFIX = "/aws/lambda/";

// Biến môi trường
export const ENVIRONMENT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
export const ENVIRONMENT_MAX_BYTES = 4 * KIBIBYTE;
// Lambda tự đặt các biến này; AWS thật từ chối nếu function tự khai báo (Floci thì không chặn)
export const RESERVED_ENVIRONMENT_KEYS = [
  "_HANDLER",
  "_X_AMZN_TRACE_ID",
  "AWS_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_DEFAULT_REGION",
  "AWS_EXECUTION_ENV",
  "AWS_LAMBDA_FUNCTION_MEMORY_SIZE",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_LAMBDA_FUNCTION_VERSION",
  "AWS_LAMBDA_INITIALIZATION_TYPE",
  "AWS_LAMBDA_LOG_GROUP_NAME",
  "AWS_LAMBDA_LOG_STREAM_NAME",
  "AWS_LAMBDA_RUNTIME_API",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "LAMBDA_RUNTIME_DIR",
  "LAMBDA_TASK_ROOT",
];

// Invoke
export const INVOCATION_TYPES = { sync: "RequestResponse", async: "Event" } as const;
export type InvocationType = (typeof INVOCATION_TYPES)[keyof typeof INVOCATION_TYPES];
// Đồng hồ của container Floci và của trình duyệt có thể lệch nhau chút ít
export const LOG_CLOCK_SKEW_MS = MILLISECONDS_PER_SECOND;

// Tab Monitor
export const LOG_RANGES = [
  { id: "15m", text: "15m", milliseconds: 15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND },
  { id: "1h", text: "1h", milliseconds: SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND },
  { id: "1d", text: "1d", milliseconds: SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
  { id: "7d", text: "7d", milliseconds: 7 * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
] as const;
export type LogRangeId = (typeof LOG_RANGES)[number]["id"];
export const DEFAULT_LOG_RANGE: LogRangeId = "1h";
export const LOG_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

// Trigger
export const TRIGGER_SOURCES = { s3: "S3", sqs: "SQS" } as const;
export type TriggerSource = keyof typeof TRIGGER_SOURCES;
export const S3_TRIGGER_EVENTS = ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"] as const;
export const SQS_ARN_PATTERN = /^arn:aws:sqs:/;
export const SQS_BATCH_SIZE = { min: 1, max: 10, default: 10 } as const;
export const SQS_QUEUE_ARN_EXAMPLE = "orders-queue";
export const EVENT_SOURCE_STATES = { enabled: "Enabled", disabled: "Disabled" } as const;

// Mẫu event ở tab Test, rút gọn từ mẫu của AWS Console
const EXAMPLE_BUCKET = "example-bucket";
const EXAMPLE_QUEUE = "my-queue";

export const eventTemplates = (region: string) => ({
  "Hello world": { key1: "value1", key2: "value2", key3: "value3" },
  "S3 Put": {
    Records: [
      {
        eventVersion: "2.1",
        eventSource: "aws:s3",
        awsRegion: region,
        eventTime: "1970-01-01T00:00:00.000Z",
        eventName: "ObjectCreated:Put",
        s3: {
          s3SchemaVersion: "1.0",
          configurationId: "testConfigRule",
          bucket: { name: EXAMPLE_BUCKET, arn: `arn:aws:s3:::${EXAMPLE_BUCKET}` },
          object: { key: "test/key", size: 1024, eTag: "0123456789abcdef0123456789abcdef" },
        },
      },
    ],
  },
  "SQS message": {
    Records: [
      {
        messageId: "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
        receiptHandle: "MessageReceiptHandle",
        body: "Hello from SQS!",
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1523232000000",
          SenderId: "123456789012",
          ApproximateFirstReceiveTimestamp: "1523232000001",
        },
        messageAttributes: {},
        md5OfBody: "7b270e59b47ff90a553787216d55d91d",
        eventSource: "aws:sqs",
        eventSourceARN: `arn:aws:sqs:${region}:${FLOCI_ACCOUNT_ID}:${EXAMPLE_QUEUE}`,
        awsRegion: region,
      },
    ],
  },
  "API Gateway": {
    resource: "/{proxy+}",
    path: "/hello/world",
    httpMethod: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*" },
    queryStringParameters: { foo: "bar" },
    pathParameters: { proxy: "hello/world" },
    requestContext: {
      accountId: FLOCI_ACCOUNT_ID,
      resourcePath: "/{proxy+}",
      httpMethod: "POST",
      stage: "dev",
    },
    body: '{"test":"body"}',
    isBase64Encoded: false,
  },
});
export type EventTemplateName = keyof ReturnType<typeof eventTemplates>;
export const DEFAULT_EVENT_TEMPLATE: EventTemplateName = "Hello world";
