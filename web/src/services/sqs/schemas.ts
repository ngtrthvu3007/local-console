import { z } from "zod";
import { kmsKeyIdSchema } from "../kms/schemas.ts";
import { formatBytes } from "@shared/format.ts";
import { enumOfKeys, wholeNumberIn } from "@shared/schemas.ts";
import { SQS_BATCH_SIZE } from "../lambda/constants.ts";
import { issueAdder, mappingOptionsIssues, mappingOptionsShape } from "../lambda/schemas.ts";
import {
  QUEUE_ENCRYPTION,
  FIFO_SUFFIX,
  MAX_RECEIVE_COUNT,
  QUEUE_NAME_MAX_LENGTH,
  QUEUE_NAME_PATTERN,
  QUEUE_TYPES,
  SETTING_LIMITS,
} from "./constants.ts";

export const createQueueSchema = z
  .object({
    type: enumOfKeys(QUEUE_TYPES),
    name: z.string().trim(),
    contentBasedDedup: z.boolean(),
    encryption: z.enum([QUEUE_ENCRYPTION.sseSqs, QUEUE_ENCRYPTION.sseKms]),
    kmsKeyId: kmsKeyIdSchema,
  })
  .superRefine(({ type, name }, context) => {
    const addIssue = (message: string) =>
      context.addIssue({ code: "custom", path: ["name"], message });
    if (!name) return addIssue("Enter a queue name.");
    if (name.length > QUEUE_NAME_MAX_LENGTH)
      return addIssue(`Must be at most ${QUEUE_NAME_MAX_LENGTH} characters.`);
    const fifoName = name.endsWith(FIFO_SUFFIX);
    // Luật của SQS: queue FIFO bắt buộc có đuôi .fifo, queue Standard không được có
    if (type === "fifo" && !fifoName)
      return addIssue(`A FIFO queue name must end with ${FIFO_SUFFIX}.`);
    if (type === "standard" && fifoName)
      return addIssue(`Only FIFO queue names end with ${FIFO_SUFFIX}.`);
    const baseName = fifoName ? name.slice(0, -FIFO_SUFFIX.length) : name;
    if (!QUEUE_NAME_PATTERN.test(baseName))
      addIssue("Use only letters, numbers, hyphens (-) and underscores (_).");
  });

export type CreateQueueForm = z.input<typeof createQueueSchema>;

export const queueSettingsSchema = z.object({
  visibilityTimeout: wholeNumberIn(SETTING_LIMITS.visibilityTimeout, "seconds"),
  delay: wholeNumberIn(SETTING_LIMITS.delay, "seconds"),
  retention: wholeNumberIn(SETTING_LIMITS.retention, "seconds"),
  maxMessageSizeKiB: wholeNumberIn(SETTING_LIMITS.maxMessageSizeKiB, "KiB"),
  receiveWait: wholeNumberIn(SETTING_LIMITS.receiveWait, "seconds"),
  contentBasedDedup: z.boolean(),
});

export const deadLetterSchema = z
  .object({
    enabled: z.boolean(),
    deadLetterTargetArn: z.string(),
    maxReceiveCount: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.enabled) return;

    if (!values.deadLetterTargetArn)
      context.addIssue({
        code: "custom",
        path: ["deadLetterTargetArn"],
        message: "Choose a queue.",
      });

    const count = wholeNumberIn(MAX_RECEIVE_COUNT, "receives").safeParse(values.maxReceiveCount);

    if (!count.success)
      context.addIssue({
        code: "custom",
        path: ["maxReceiveCount"],
        message: count.error.issues[0].message,
      });
  });

const textEncoder = new TextEncoder();

interface SendTarget {
  fifo: boolean;
  contentBasedDedup: boolean;
  maxMessageSize: number; // byte
}

export const sendMessageSchema = ({ fifo, contentBasedDedup, maxMessageSize }: SendTarget) =>
  z
    .object({
      body: z.string(),
      groupId: z.string().trim(),
      dedupId: z.string().trim(),
    })
    .superRefine((values, context) => {
      const addIssue = (field: string, message: string) =>
        context.addIssue({ code: "custom", path: [field], message });

      if (!values.body) addIssue("body", "Enter a message body.");
      else if (textEncoder.encode(values.body).length > maxMessageSize)
        addIssue("body", `The body must be at most ${formatBytes(maxMessageSize)}.`);

      if (!fifo) return;
      // Chặn trước khi gửi, SQS trả MissingParameter
      if (!values.groupId) addIssue("groupId", "Enter a message group ID.");
      if (!contentBasedDedup && !values.dedupId)
        addIssue("dedupId", "Enter a deduplication ID, or turn on content-based deduplication.");
    });

export const queueTriggerSchema = z
  .object({
    functionName: z.string().min(1, "Choose a function."),
    batchSize: wholeNumberIn(SQS_BATCH_SIZE, "messages"),
    enabled: z.boolean(),
    ...mappingOptionsShape,
  })
  .superRefine((values, context) => mappingOptionsIssues("sqs", values, issueAdder(context)));
