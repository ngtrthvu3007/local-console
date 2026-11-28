import { z } from "zod";
import { kmsKeyIdSchema } from "../kms/schemas.ts";
import { enumOfKeys } from "@shared/schemas.ts";
import {
  ATTRIBUTE_DATA_TYPES,
  FIFO_SUFFIX,
  FILTER_SCOPES,
  HTTP_PROTOCOLS,
  MAX_MESSAGE_ATTRIBUTES,
  PHONE_NUMBER_EXAMPLE,
  PHONE_NUMBER_PATTERN,
  PROTOCOLS,
  SMS_TYPES,
  TOPIC_NAME_MAX_LENGTH,
  TOPIC_NAME_PATTERN,
  TOPIC_TYPES,
} from "./constants.ts";
import { filterPolicyError } from "./filterPolicy.ts";

export const createTopicSchema = z
  .object({
    type: enumOfKeys(TOPIC_TYPES),
    name: z.string().trim(),
    contentBasedDedup: z.boolean(),
    encrypted: z.boolean(),
    kmsKeyId: kmsKeyIdSchema,
  })
  .superRefine(({ type, name }, context) => {
    const addIssue = (message: string) =>
      context.addIssue({ code: "custom", path: ["name"], message });
    if (!name) return addIssue("Enter a topic name.");
    if (name.length > TOPIC_NAME_MAX_LENGTH)
      return addIssue(`Must be at most ${TOPIC_NAME_MAX_LENGTH} characters.`);
    const fifoName = name.endsWith(FIFO_SUFFIX);
    // Luật của SNS: topic FIFO bắt buộc có đuôi .fifo, topic Standard không được có
    if (type === "fifo" && !fifoName)
      return addIssue(`A FIFO topic name must end with ${FIFO_SUFFIX}.`);
    if (type === "standard" && fifoName)
      return addIssue(`Only FIFO topic names end with ${FIFO_SUFFIX}.`);
    const baseName = fifoName ? name.slice(0, -FIFO_SUFFIX.length) : name;
    if (!TOPIC_NAME_PATTERN.test(baseName))
      addIssue("Use only letters, numbers, hyphens (-) and underscores (_).");
  });

export type CreateTopicForm = z.input<typeof createTopicSchema>;

// Sửa filter policy: rỗng = bỏ filter
export const filterPolicySchema = z
  .object({ filterPolicy: z.string(), filterScope: enumOfKeys(FILTER_SCOPES) })
  .superRefine((values, context) => {
    const error = filterPolicyError(values.filterPolicy);
    if (error) context.addIssue({ code: "custom", path: ["filterPolicy"], message: error });
  });

export const createSubscriptionSchema = z
  .object({
    protocol: enumOfKeys(PROTOCOLS),
    queueArn: z.string(),
    functionArn: z.string(),
    url: z.string().trim(),
    rawDelivery: z.boolean(),
    filterPolicy: z.string(),
    filterScope: enumOfKeys(FILTER_SCOPES),
  })
  .superRefine((values, context) => {
    const addIssue = (field: string, message: string) =>
      context.addIssue({ code: "custom", path: [field], message });
    if (values.protocol === "sqs" && !values.queueArn) addIssue("queueArn", "Choose a queue.");
    if (values.protocol === "lambda" && !values.functionArn)
      addIssue("functionArn", "Choose a function.");
    if (HTTP_PROTOCOLS.includes(values.protocol) && !isUrlOf(values.protocol, values.url))
      addIssue("url", `Enter a URL that starts with ${values.protocol}://`);
    const filterError = filterPolicyError(values.filterPolicy);
    if (filterError) addIssue("filterPolicy", filterError);
  });

// URL của HTTP subscription: đúng scheme và có host
function isUrlOf(protocol: string, text: string) {
  try {
    const url = new URL(text);
    return url.protocol === `${protocol}:` && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const attributeSchema = z.object({
  name: z.string().trim(),
  type: z.enum(ATTRIBUTE_DATA_TYPES),
  value: z.string().trim(),
});

interface PublishTarget {
  fifo: boolean;
  contentBasedDedup: boolean;
}

export const publishSchema = ({ fifo, contentBasedDedup }: PublishTarget) =>
  z
    .object({
      subject: z.string().trim(),
      body: z.string(),
      attributes: z.array(attributeSchema).max(MAX_MESSAGE_ATTRIBUTES),
      groupId: z.string().trim(),
      dedupId: z.string().trim(),
    })
    .superRefine((values, context) => {
      const addIssue = (path: (string | number)[], message: string) =>
        context.addIssue({ code: "custom", path, message });
      if (!values.body.trim()) addIssue(["body"], "Enter a message body.");
      const names = new Set<string>();

      values.attributes.forEach((attribute, index) => {
        if (!attribute.name) addIssue(["attributes", index, "name"], "Enter a name.");
        else if (names.has(attribute.name))
          addIssue(["attributes", index, "name"], "Names must be unique.");

        names.add(attribute.name);

        if (!attribute.value) addIssue(["attributes", index, "value"], "Enter a value.");
        else if (attribute.type === "Number" && !Number.isFinite(Number(attribute.value)))
          addIssue(["attributes", index, "value"], "Enter a number.");
      });

      if (!fifo) return;
      // Chặn trước khi gửi, SNS trả InvalidParameter
      if (!values.groupId) addIssue(["groupId"], "Enter a message group ID.");
      if (!contentBasedDedup && !values.dedupId)
        addIssue(["dedupId"], "Enter a deduplication ID, or turn on content-based deduplication.");
    });

export type PublishForm = z.input<ReturnType<typeof publishSchema>>;

export const publishSmsSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(PHONE_NUMBER_PATTERN, `Enter a phone number like ${PHONE_NUMBER_EXAMPLE}.`),
  message: z.string().trim().min(1, "Enter a message."),
  type: z.enum(SMS_TYPES),
});
