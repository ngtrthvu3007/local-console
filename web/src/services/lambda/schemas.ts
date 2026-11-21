import { z } from "zod";
import { formatBytes } from "@shared/format.ts";
import { jsonObjectError } from "@shared/json.ts";
import {
  ASYNC_EVENT_AGE_SECONDS,
  ASYNC_RETRY_ATTEMPTS,
  DESCRIPTION_MAX_LENGTH,
  DESTINATION_KINDS,
  type DestinationKind,
  ENVIRONMENT_KEY_PATTERN,
  FILTER_PATTERN_LIMIT,
  ON_FAILURE_KIND_IDS,
  ENVIRONMENT_MAX_BYTES,
  FUNCTION_NAME_MAX_LENGTH,
  FUNCTION_NAME_PATTERN,
  MEMORY_LIMITS_MB,
  RESERVED_ENVIRONMENT_KEYS,
  RUNTIMES,
  S3_TRIGGER_EVENTS,
  SQS_BATCH_SIZE,
  STARTING_POSITIONS,
  STREAM_BATCH_SIZE,
  STREAM_RECORD_AGE_SECONDS,
  STREAM_RETRY_ATTEMPTS,
  type StartingPosition,
  TIMEOUT_LIMITS_SECONDS,
  TRIGGER_SOURCES,
  type TriggerSource,
} from "./constants.ts";

import type { MappingOptions, MappingSource } from "./mappingOptions.ts";

const TRIGGER_SOURCE_IDS = Object.keys(TRIGGER_SOURCES) as [TriggerSource, ...TriggerSource[]];

// Ô số nguyên trong khoảng [min, max]; Input của Cloudscape luôn trả chuỗi
export const wholeNumberIn = (limits: { min: number; max: number }, unit: string) =>
  z
    .string()
    .trim()
    .refine((text) => {
      const value = Number(text);
      return text !== "" && Number.isInteger(value) && value >= limits.min && value <= limits.max;
    }, `Enter a whole number from ${limits.min} to ${limits.max} ${unit}.`)
    .transform(Number);

const memorySchema = wholeNumberIn(MEMORY_LIMITS_MB, "MB");
const timeoutSchema = wholeNumberIn(TIMEOUT_LIMITS_SECONDS, "seconds");
const handlerSchema = z.string().trim().min(1, "Enter a handler.");

export const createFunctionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a function name.")
    .max(FUNCTION_NAME_MAX_LENGTH, `Must be at most ${FUNCTION_NAME_MAX_LENGTH} characters.`)
    .regex(FUNCTION_NAME_PATTERN, "Use only letters, numbers, hyphens (-) and underscores (_)."),
  runtime: z.enum(RUNTIMES),
  memory: memorySchema,
  timeout: timeoutSchema,
});

export const generalConfigurationSchema = z.object({
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, `Must be at most ${DESCRIPTION_MAX_LENGTH} characters.`),
  memory: memorySchema,
  timeout: timeoutSchema,
  runtime: z.string().min(1, "Choose a runtime."),
  handler: handlerSchema,
});

const textEncoder = new TextEncoder();
const byteLength = (text: string) => textEncoder.encode(text).length;

export const environmentSchema = z
  .object({ entries: z.array(z.object({ key: z.string().trim(), value: z.string() })) })
  .superRefine(({ entries }, context) => {
    const seenKeys = new Set<string>();
    entries.forEach(({ key }, index) => {
      const path = ["entries", index, "key"];
      const message = !key
        ? "Enter a key."
        : !ENVIRONMENT_KEY_PATTERN.test(key)
          ? "Start with a letter; use only letters, numbers and underscores."
          : RESERVED_ENVIRONMENT_KEYS.includes(key)
            ? "Reserved by Lambda."
            : seenKeys.has(key)
              ? "Duplicate key."
              : undefined;
      seenKeys.add(key);
      if (message) context.addIssue({ code: "custom", path, message });
    });
    const totalBytes = entries.reduce(
      (total, entry) => total + byteLength(entry.key) + byteLength(entry.value),
      0,
    );
    if (totalBytes > ENVIRONMENT_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: `All variables together must be at most ${formatBytes(ENVIRONMENT_MAX_BYTES)}.`,
      });
    }
  });

// Dùng chung cho tab Triggers của Lambda và trang bảng DynamoDB
export const startingPositionSchema = z.enum(
  Object.keys(STARTING_POSITIONS) as [StartingPosition, ...StartingPosition[]],
);
export const streamBatchSizeSchema = wholeNumberIn(STREAM_BATCH_SIZE, "records");

// Các ô tùy chọn nâng cao của trigger, dùng chung cho Lambda, SQS và DynamoDB
export const mappingOptionsShape = {
  filterPatterns: z.array(z.object({ pattern: z.string() })),
  reportBatchFailures: z.boolean(),
  retryAttempts: z.string().trim(),
  maxRecordAge: z.string().trim(),
  onFailureKind: z.enum(ON_FAILURE_KIND_IDS),
  onFailureArn: z.string(),
};

type AddIssue = (path: (string | number)[], message: string) => void;
export const issueAdder =
  (context: {
    addIssue: (issue: { code: "custom"; path: (string | number)[]; message: string }) => void;
  }): AddIssue =>
  (path, message) =>
    context.addIssue({ code: "custom", path, message });

// Pattern rỗng bỏ qua; pattern sai cú pháp filter (JSON hợp lệ) do Floci từ chối khi lưu
export function mappingOptionsIssues(
  source: MappingSource,
  values: MappingOptions,
  addIssue: AddIssue,
) {
  values.filterPatterns.forEach(({ pattern }, index) => {
    const error = pattern.trim()
      ? jsonObjectError(pattern, "A filter pattern is a JSON object.")
      : undefined;
    if (error) addIssue(["filterPatterns", index, "pattern"], error);
  });
  if (values.filterPatterns.length > FILTER_PATTERN_LIMIT)
    addIssue(["filterPatterns"], `Use at most ${FILTER_PATTERN_LIMIT} patterns.`);
  if (source === "sqs") return;

  if (!wholeNumberIn(STREAM_RETRY_ATTEMPTS, "attempts").safeParse(values.retryAttempts).success)
    addIssue(
      ["retryAttempts"],
      `Enter a whole number from ${STREAM_RETRY_ATTEMPTS.min} to ${STREAM_RETRY_ATTEMPTS.max} (${STREAM_RETRY_ATTEMPTS.min} retries until the record expires).`,
    );
  const age = Number(values.maxRecordAge);
  const validAge =
    values.maxRecordAge !== "" &&
    Number.isInteger(age) &&
    (age === STREAM_RECORD_AGE_SECONDS.forever ||
      (age >= STREAM_RECORD_AGE_SECONDS.min && age <= STREAM_RECORD_AGE_SECONDS.max));
  if (!validAge)
    addIssue(
      ["maxRecordAge"],
      `Enter ${STREAM_RECORD_AGE_SECONDS.forever} or a whole number of seconds from ${STREAM_RECORD_AGE_SECONDS.min} to ${STREAM_RECORD_AGE_SECONDS.max}.`,
    );
  if (values.onFailureKind !== "none" && !values.onFailureArn)
    addIssue(["onFailureArn"], `Choose a ${values.onFailureKind === "sqs" ? "queue" : "topic"}.`);
}

export const triggerSchema = z
  .object({
    source: z.enum(TRIGGER_SOURCE_IDS),
    bucket: z.string(),
    events: z.array(z.enum(S3_TRIGGER_EVENTS)),
    prefix: z.string().trim(),
    suffix: z.string().trim(),
    queueArn: z.string().trim(),
    table: z.string(),
    startingPosition: startingPositionSchema,
    batchSize: z.string().trim(),
    enabled: z.boolean(),
    ...mappingOptionsShape,
  })
  .superRefine((values, context) => {
    const addIssue = (field: string, message: string) =>
      context.addIssue({ code: "custom", path: [field], message });
    if (values.source === "s3") {
      if (!values.bucket) addIssue("bucket", "Choose a bucket.");
      if (!values.events.length) addIssue("events", "Choose at least one event type.");
      return;
    }
    if (values.source === "dynamodb") {
      if (!values.table) addIssue("table", "Choose a table with a stream.");
      const batchSize = streamBatchSizeSchema.safeParse(values.batchSize);
      if (!batchSize.success) addIssue("batchSize", batchSize.error.issues[0].message);
      mappingOptionsIssues("dynamodb", values, issueAdder(context));
      return;
    }
    if (!values.queueArn) addIssue("queueArn", "Choose a queue.");
    const batchSize = wholeNumberIn(SQS_BATCH_SIZE, "records").safeParse(values.batchSize);
    if (!batchSize.success) addIssue("batchSize", batchSize.error.issues[0].message);
    mappingOptionsIssues("sqs", values, issueAdder(context));
  });

// Modal Edit trigger (Lambda › Triggers): batch size cùng các tùy chọn, theo nguồn của trigger
export const editTriggerSchema = (source: MappingSource) =>
  z
    .object({
      batchSize: wholeNumberIn(source === "sqs" ? SQS_BATCH_SIZE : STREAM_BATCH_SIZE, "records"),
      ...mappingOptionsShape,
    })
    .superRefine((values, context) => mappingOptionsIssues(source, values, issueAdder(context)));

export type TriggerFormOutput = z.output<typeof triggerSchema>;

export const testEventNameSchema = (existingNames: string[]) =>
  z
    .string()
    .trim()
    .min(1, "Enter an event name to save it.")
    .refine((name) => !existingNames.includes(name), "An event with this name already exists.");

// Modal Edit của khối Asynchronous invocation; đích chọn từ dropdown nên chỉ cần kiểm có chọn
const DESTINATION_KIND_IDS = Object.keys(DESTINATION_KINDS) as [
  DestinationKind,
  ...DestinationKind[],
];
export const asyncInvocationSchema = z
  .object({
    retryAttempts: wholeNumberIn(ASYNC_RETRY_ATTEMPTS, "retries"),
    maxEventAge: wholeNumberIn(ASYNC_EVENT_AGE_SECONDS, "seconds"),
    onSuccessKind: z.enum(DESTINATION_KIND_IDS),
    onSuccessArn: z.string(),
    onFailureKind: z.enum(DESTINATION_KIND_IDS),
    onFailureArn: z.string(),
  })
  .superRefine((values, context) => {
    const add = issueAdder(context);
    if (values.onSuccessKind !== "none" && !values.onSuccessArn)
      add(["onSuccessArn"], "Choose a destination.");
    if (values.onFailureKind !== "none" && !values.onFailureArn)
      add(["onFailureArn"], "Choose a destination.");
  });
