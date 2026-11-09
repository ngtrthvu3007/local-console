import type { Event } from "@aws-sdk/client-s3";
import {
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@shared/constants.ts";

const MEBIBYTE = 1024 * 1024;

export const PATH_DELIMITER = "/";

// Giới hạn của S3 API
export const MAX_KEYS_PER_PAGE = 1000;
export const MAX_KEYS_PER_DELETE = 1000;
export const MIN_MULTIPART_PART_BYTES = 5 * MEBIBYTE;

// Upload
export const UPLOAD_PARTS_IN_PARALLEL = 4;
export const UPLOAD_FILES_IN_PARALLEL = 3;

// Xem trước object
export const TEXT_PREVIEW_MAX_BYTES = 1 * MEBIBYTE;
export const IMAGE_PREVIEW_MAX_BYTES = 10 * MEBIBYTE;
export const TEXT_CONTENT_TYPE_PATTERN =
  /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|x-sh))/;
export const TEXT_FILE_EXTENSIONS = [
  "txt",
  "json",
  "md",
  "csv",
  "log",
  "xml",
  "yml",
  "yaml",
  "html",
  "css",
  "js",
  "ts",
  "sh",
  "env",
];
export const IMAGE_CONTENT_TYPE_PREFIX = "image/";
export const JSON_CONTENT_TYPE = "application/json";
export const JSON_FILE_EXTENSION = "json";

// Tải về
export const DOWNLOAD_URL_LIFETIME_SECONDS = 5 * SECONDS_PER_MINUTE;
export const DOWNLOAD_SPACING_MS = 0.4 * MILLISECONDS_PER_SECOND; // trình duyệt chặn nếu tải dồn dập

// Pre-signed URL
export const PRESIGN_EXPIRY_OPTIONS = [
  { value: String(SECONDS_PER_MINUTE), label: "1 minute" },
  { value: String(15 * SECONDS_PER_MINUTE), label: "15 minutes" },
  { value: String(SECONDS_PER_HOUR), label: "1 hour" },
  { value: String(12 * SECONDS_PER_HOUR), label: "12 hours" },
  { value: String(SECONDS_PER_DAY), label: "1 day" },
  { value: String(7 * SECONDS_PER_DAY), label: "7 days" },
];
export const DEFAULT_PRESIGN_EXPIRY = PRESIGN_EXPIRY_OPTIONS[2];
export const PRESIGN_METHODS = ["GET", "PUT"] as const;
export type PresignMethod = (typeof PRESIGN_METHODS)[number];
export const PRESIGN_METHOD_LABELS: Record<PresignMethod, string> = {
  GET: "Download (GET)",
  PUT: "Upload (PUT)",
};

// Luật đặt tên bucket của AWS
export const BUCKET_NAME_MIN_LENGTH = 3;
export const BUCKET_NAME_MAX_LENGTH = 63;
export const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
export const IP_ADDRESS_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
export const ADJACENT_DOTS = "..";

// us-east-1 là region duy nhất không được gửi LocationConstraint
export const REGION_WITHOUT_LOCATION_CONSTRAINT = "us-east-1";

export const VERSIONING_STATUS = {
  enabled: "Enabled",
  suspended: "Suspended",
  disabled: "Disabled",
} as const;
export type VersioningStatus = (typeof VERSIONING_STATUS)[keyof typeof VERSIONING_STATUS];
export const VERSIONING_DESCRIPTION =
  "Keep every version of an object, so you can restore one after it is overwritten or deleted.";

export const BUCKET_LIST_PAGE_SIZE = 50;
export const DELETE_PREVIEW_COUNT = 8;

// Event notification
export const NOTIFICATION_EVENT_TYPES = [
  "s3:ObjectCreated:*",
  "s3:ObjectCreated:Put",
  "s3:ObjectCreated:Post",
  "s3:ObjectCreated:Copy",
  "s3:ObjectCreated:CompleteMultipartUpload",
  "s3:ObjectRemoved:*",
  "s3:ObjectRemoved:Delete",
  "s3:ObjectRemoved:DeleteMarkerCreated",
] as const satisfies readonly Event[];
export type NotificationEvent = (typeof NOTIFICATION_EVENT_TYPES)[number];
export const DEFAULT_NOTIFICATION_EVENTS: NotificationEvent[] = ["s3:ObjectCreated:*"];
export const FILTER_RULE_NAMES = { prefix: "prefix", suffix: "suffix" } as const;
export const FLOCI_ACCOUNT_ID = "000000000000";

export const NOTIFICATION_DESTINATIONS = {
  lambda: {
    label: "Lambda function",
    arnPattern: /^arn:aws:lambda:/,
    arnExample: "function:my-function",
  },
  sqs: { label: "SQS queue", arnPattern: /^arn:aws:sqs:/, arnExample: "my-queue" },
  sns: { label: "SNS topic", arnPattern: /^arn:aws:sns:/, arnExample: "my-topic" },
} as const;
export type NotificationDestination = keyof typeof NOTIFICATION_DESTINATIONS;

// Lifecycle
export const LIFECYCLE_STATUS = { enabled: "Enabled", disabled: "Disabled" } as const;
export const MIN_LIFECYCLE_DAYS = 1;

// Mẫu cấu hình chèn sẵn ở tab Permissions
export const EXAMPLE_CORS_RULES = [
  {
    AllowedHeaders: ["*"],
    AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
    AllowedOrigins: ["http://localhost:3000", "http://localhost:5173"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3000,
  },
];

export const examplePublicReadPolicy = (bucket: string) => ({
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicRead",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${bucket}/*`,
    },
  ],
});
