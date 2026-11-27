import { z } from "zod";
import { kmsKeyArnSchema } from "../kms/schemas.ts";
import { byteLength, formatBytes } from "@shared/format.ts";
import { jsonObjectError } from "@shared/json.ts";
import { enumOfKeys, isWholeNumberIn, wholeNumberIn } from "@shared/schemas.ts";
import {
  ASYNC_EVENT_AGE_SECONDS,
  ASYNC_RETRY_ATTEMPTS,
  DESCRIPTION_MAX_LENGTH,
  DESTINATION_KINDS,
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
  TIMEOUT_LIMITS_SECONDS,
  TRIGGER_SOURCES,
} from "./constants.ts";

import type { MappingOptions, MappingSource } from "./mappingOptions.ts";

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

export const environmentSchema = z
  .object({
    entries: z.array(z.object({ key: z.string().trim(), value: z.string() })),
    kmsKeyArn: kmsKeyArnSchema,
  })
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

// Dùng chung cho Add trigger của Lambda và của trang stream (DynamoDB, Kinesis)
const startingPositionSchema = enumOfKeys(STARTING_POSITIONS);

const streamBatchSizeSchema = wholeNumberIn(STREAM_BATCH_SIZE, "records");

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

  if (!isWholeNumberIn(values.retryAttempts, STREAM_RETRY_ATTEMPTS))
    addIssue(
      ["retryAttempts"],
      `Enter a whole number from ${STREAM_RETRY_ATTEMPTS.min} to ${STREAM_RETRY_ATTEMPTS.max} (${STREAM_RETRY_ATTEMPTS.min} retries until the record expires).`,
    );

  const validAge =
    Number(values.maxRecordAge) === STREAM_RECORD_AGE_SECONDS.forever ||
    isWholeNumberIn(values.maxRecordAge, STREAM_RECORD_AGE_SECONDS);

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
    source: enumOfKeys(TRIGGER_SOURCES),
    bucket: z.string(),
    events: z.array(z.enum(S3_TRIGGER_EVENTS)),
    prefix: z.string().trim(),
    suffix: z.string().trim(),
    queueArn: z.string().trim(),
    table: z.string(),
    stream: z.string(), // ARN của Kinesis stream
    startingPosition: startingPositionSchema,
    batchSize: z.string().trim(),
    enabled: z.boolean(),
    ...mappingOptionsShape,
  })
  .superRefine((values, context) => {
    const addIssue = issueAdder(context);

    if (values.source === "s3") {
      if (!values.bucket) addIssue(["bucket"], "Choose a bucket.");
      if (!values.events.length) addIssue(["events"], "Choose at least one event type.");
      return;
    }

    if (values.source === "dynamodb" || values.source === "kinesis") {
      if (values.source === "dynamodb" && !values.table)
        addIssue(["table"], "Choose a table with a stream.");
      if (values.source === "kinesis" && !values.stream)
        addIssue(["stream"], "Choose a data stream.");
      const batchSize = streamBatchSizeSchema.safeParse(values.batchSize);
      if (!batchSize.success) addIssue(["batchSize"], batchSize.error.issues[0].message);
      mappingOptionsIssues("dynamodb", values, addIssue);
      return;
    }

    if (!values.queueArn) addIssue(["queueArn"], "Choose a queue.");
    const batchSize = wholeNumberIn(SQS_BATCH_SIZE, "records").safeParse(values.batchSize);
    if (!batchSize.success) addIssue(["batchSize"], batchSize.error.issues[0].message);
    mappingOptionsIssues("sqs", values, addIssue);
  });

// Add trigger từ trang của stream (DynamoDB Stream, Kinesis): chọn function
export const streamTriggerSchema = z
  .object({
    functionName: z.string().min(1, "Choose a function."),
    startingPosition: startingPositionSchema,
    batchSize: streamBatchSizeSchema,
    enabled: z.boolean(),
    ...mappingOptionsShape,
  })
  .superRefine((values, context) => mappingOptionsIssues("dynamodb", values, issueAdder(context)));

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

export const asyncInvocationSchema = z
  .object({
    retryAttempts: wholeNumberIn(ASYNC_RETRY_ATTEMPTS, "retries"),
    maxEventAge: wholeNumberIn(ASYNC_EVENT_AGE_SECONDS, "seconds"),
    onSuccessKind: enumOfKeys(DESTINATION_KINDS),
    onSuccessArn: z.string(),
    onFailureKind: enumOfKeys(DESTINATION_KINDS),
    onFailureArn: z.string(),
  })
  .superRefine((values, context) => {
    const add = issueAdder(context);
    if (values.onSuccessKind !== "none" && !values.onSuccessArn)
      add(["onSuccessArn"], "Choose a destination.");
    if (values.onFailureKind !== "none" && !values.onFailureArn)
      add(["onFailureArn"], "Choose a destination.");
  });
