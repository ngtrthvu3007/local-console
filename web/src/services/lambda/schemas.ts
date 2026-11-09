import { z } from "zod";
import { formatBytes } from "@shared/format.ts";
import {
  DESCRIPTION_MAX_LENGTH,
  ENVIRONMENT_KEY_PATTERN,
  ENVIRONMENT_MAX_BYTES,
  FUNCTION_NAME_MAX_LENGTH,
  FUNCTION_NAME_PATTERN,
  MEMORY_LIMITS_MB,
  RESERVED_ENVIRONMENT_KEYS,
  RUNTIMES,
  S3_TRIGGER_EVENTS,
  SQS_ARN_PATTERN,
  SQS_BATCH_SIZE,
  TIMEOUT_LIMITS_SECONDS,
  TRIGGER_SOURCES,
  type TriggerSource,
} from "./constants.ts";

const TRIGGER_SOURCE_IDS = Object.keys(TRIGGER_SOURCES) as [TriggerSource, ...TriggerSource[]];

// Ô số nguyên trong khoảng [min, max]; Input của Cloudscape luôn trả chuỗi
const wholeNumberIn = (limits: { min: number; max: number }, unit: string) =>
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

export const triggerSchema = z
  .object({
    source: z.enum(TRIGGER_SOURCE_IDS),
    bucket: z.string(),
    events: z.array(z.enum(S3_TRIGGER_EVENTS)),
    prefix: z.string().trim(),
    suffix: z.string().trim(),
    queueArn: z.string().trim(),
    batchSize: z.string().trim(),
    enabled: z.boolean(),
  })
  .superRefine((values, context) => {
    const addIssue = (field: string, message: string) =>
      context.addIssue({ code: "custom", path: [field], message });
    if (values.source === "s3") {
      if (!values.bucket) addIssue("bucket", "Choose a bucket.");
      if (!values.events.length) addIssue("events", "Choose at least one event type.");
      return;
    }
    if (!SQS_ARN_PATTERN.test(values.queueArn))
      addIssue("queueArn", "Enter the ARN of an SQS queue.");
    const batchSize = wholeNumberIn(SQS_BATCH_SIZE, "records").safeParse(values.batchSize);
    if (!batchSize.success) addIssue("batchSize", batchSize.error.issues[0].message);
  });

export type TriggerFormOutput = z.output<typeof triggerSchema>;

export const testEventNameSchema = (existingNames: string[]) =>
  z
    .string()
    .trim()
    .min(1, "Enter an event name to save it.")
    .refine((name) => !existingNames.includes(name), "An event with this name already exists.");
