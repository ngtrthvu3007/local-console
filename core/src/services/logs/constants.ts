import {
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "#shared/constants.ts";
import { pluralize } from "#shared/utils/format.ts";

// Giá trị retention AWS cho phép; Floci nhận cả số khác nên form chỉ cho chọn trong này
const RETENTION_DAYS = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288,
  3653,
] as const;
export const NEVER_EXPIRE = "never";
const NEVER_EXPIRE_LABEL = "Never expire";

// Group không có retentionInDays là không bao giờ hết hạn
export const retentionLabel = (days?: number) =>
  days === undefined ? NEVER_EXPIRE_LABEL : pluralize(days, "day");

export const RETENTION_OPTIONS: { value: string; label: string }[] = [
  { value: NEVER_EXPIRE, label: NEVER_EXPIRE_LABEL },
  ...RETENTION_DAYS.map((days) => ({ value: String(days), label: retentionLabel(days) })),
];

// Luật tên của AWS; Floci nhận cả tên sai nên form tự kiểm
export const NAME_MAX_LENGTH = 512;
export const GROUP_NAME_PATTERN = /^[A-Za-z0-9._\-/#]+$/;
export const GROUP_NAME_RULE = `Use 1–${NAME_MAX_LENGTH} letters, numbers or . _ - / #.`;
export const STREAM_NAME_PATTERN = /^[^:*]+$/;
export const STREAM_NAME_RULE = `Use 1–${NAME_MAX_LENGTH} characters, without : or *.`;
export const FILTER_PATTERN_MAX_LENGTH = 1024;

export const DEFAULT_TEST_STREAM = "console-test";

export const DESTINATION_TYPES = { lambda: "Lambda function", kinesis: "Kinesis stream" } as const;

export const TEXT = {
  filterPlaceholder: 'Filter pattern, e.g. ERROR or { $.level = "ERROR" }',
  // Ba kiểu filter pattern Floci chạy được (spec 3.3, 7 #3)
  filterHelp:
    'Text: ERROR or ?WARN ?ERROR · JSON: { $.level = "ERROR" } · Space-delimited: [ip, method, status=5*]',
  testEvent: "Matching subscription filters deliver this event too.",
  lambdaDestination:
    "Lambda receives matching events base64-encoded and gzipped in `event.awslogs.data`.",
  kinesisDestination: "Each record is gzipped JSON; the Kinesis Data viewer shows it decompressed.",
} as const;

export const LOG_RANGES = [
  { id: "15m", text: "15m", milliseconds: 15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND },
  { id: "1h", text: "1h", milliseconds: SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND },
  { id: "1d", text: "1d", milliseconds: SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
  { id: "7d", text: "7d", milliseconds: 7 * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
] as const;

export type LogRangeId = (typeof LOG_RANGES)[number]["id"];
export const DEFAULT_LOG_RANGE: LogRangeId = "1h";
