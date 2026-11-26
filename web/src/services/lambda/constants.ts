import type { Runtime } from "@aws-sdk/client-lambda";
import {
  FLOCI_ACCOUNT_ID,
  KIBIBYTE,
  MEBIBYTE,
  MILLISECONDS_PER_SECOND,
} from "@shared/constants.ts";

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

// Trigger
export const TRIGGER_SOURCES = {
  s3: "S3",
  sqs: "SQS",
  dynamodb: "DynamoDB",
  kinesis: "Kinesis",
} as const;
export type TriggerSource = keyof typeof TRIGGER_SOURCES;

// Nguồn chỉ xem ở đây; tạo từ trang của nó (SNS: topic, rule/schedule: EventBridge, Cognito: user pool,
// Secrets Manager: rotation của secret)
const DISPLAY_ONLY_SOURCES = {
  sns: "SNS",
  eventbridge: "EventBridge",
  scheduler: "Scheduler",
  cognito: "Cognito",
  secretsmanager: "Secrets Manager",
} as const;

export const SOURCE_LABELS = { ...TRIGGER_SOURCES, ...DISPLAY_ONLY_SOURCES };
export type TriggerRowSource = keyof typeof SOURCE_LABELS;

// Rule / schedule của EventBridge, trigger của user pool, rotation của secret: chỉ xem ở đây,
// sửa / xóa ở trang của nguồn
export const VIEW_ONLY_SOURCES: readonly TriggerRowSource[] = [
  "eventbridge",
  "scheduler",
  "cognito",
  "secretsmanager",
];

export const KINESIS_ARN_PATTERN = /^arn:aws:kinesis:/;
export const S3_TRIGGER_EVENTS = ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"] as const;
export const SQS_BATCH_SIZE = { min: 1, max: 10, default: 10 } as const;
// Mỗi cặp nguồn (queue / stream) + function chỉ có một trigger: AWS từ chối cái thứ hai, Floci thì nhận
export const ALREADY_TRIGGERED = "Already has a trigger for this source";
// Trigger từ DynamoDB Stream
export const DYNAMODB_ARN_PATTERN = /^arn:aws:dynamodb:/;
export const STREAM_BATCH_SIZE = { min: 1, max: 10000, default: 100 } as const;
export const STARTING_POSITIONS = { LATEST: "Latest", TRIM_HORIZON: "Trim horizon" } as const;
export type StartingPosition = keyof typeof STARTING_POSITIONS;
export const DEFAULT_STARTING_POSITION: StartingPosition = "LATEST";

export const STARTING_POSITION_OPTIONS = Object.entries(STARTING_POSITIONS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

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

// Tùy chọn nâng cao của trigger SQS / DynamoDB stream; AWS cho tối đa 5 filter pattern
export const FILTER_PATTERN_LIMIT = 5;
// -1 = thử lại mãi mãi
export const STREAM_RETRY_ATTEMPTS = { min: -1, max: 10000, default: -1 } as const;
// -1 = giữ record mãi; còn lại 60 giây tới 7 ngày
export const STREAM_RECORD_AGE_SECONDS = { forever: -1, min: 60, max: 604800 } as const;
export const REPORT_BATCH_FAILURES = "ReportBatchItemFailures";

export const ASYNC_RETRY_ATTEMPTS = { min: 0, max: 2, default: 2 } as const;
export const ASYNC_EVENT_AGE_SECONDS = { min: 60, max: 21600, default: 21600 } as const;

export const DESTINATION_KINDS = {
  none: "None",
  sqs: "SQS queue",
  sns: "SNS topic",
  lambda: "Lambda function",
  eventbus: "Event bus",
} as const;

export type DestinationKind = keyof typeof DESTINATION_KINDS;

// Stream chỉ gửi bản ghi lỗi tới queue hoặc topic
export const ON_FAILURE_KIND_IDS = [
  "none",
  "sqs",
  "sns",
] as const satisfies readonly DestinationKind[];

export type OnFailureKind = (typeof ON_FAILURE_KIND_IDS)[number];

// Tên service trong alias key AWS managed mã hóa biến môi trường: alias/aws/lambda
export const LAMBDA_KEY_SERVICE = "lambda";
