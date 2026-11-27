import { z } from "zod";
import { enumOfKeys } from "#shared/validation/schemas.ts";
import {
  DESTINATION_TYPES,
  FILTER_PATTERN_MAX_LENGTH,
  GROUP_NAME_PATTERN,
  GROUP_NAME_RULE,
  NAME_MAX_LENGTH,
  NEVER_EXPIRE,
  RETENTION_OPTIONS,
  STREAM_NAME_PATTERN,
  STREAM_NAME_RULE,
} from "./constants.ts";

const streamName = z
  .string()
  .trim()
  .max(NAME_MAX_LENGTH, STREAM_NAME_RULE)
  .regex(STREAM_NAME_PATTERN, STREAM_NAME_RULE);

const retention = z
  .string()
  .refine(
    (value) => RETENTION_OPTIONS.some((option) => option.value === value),
    "Choose a retention period.",
  );

export const retentionDays = (value: string) =>
  value === NEVER_EXPIRE ? undefined : Number(value);

export const createLogGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .max(NAME_MAX_LENGTH, GROUP_NAME_RULE)
    .regex(GROUP_NAME_PATTERN, GROUP_NAME_RULE),
  retention,
});

export const retentionSchema = z.object({ retention });

export const testEventSchema = z.object({
  stream: streamName,
  // Không trim: giữ nguyên message người dùng gõ, chỉ chặn message toàn khoảng trắng
  message: z.string().refine((text) => text.trim() !== "", "Enter a message."),
});

export const subscriptionFilterSchema = z.object({
  name: streamName,
  filterPattern: z
    .string()
    .max(FILTER_PATTERN_MAX_LENGTH, `Use at most ${FILTER_PATTERN_MAX_LENGTH} characters.`),
  destinationType: enumOfKeys(DESTINATION_TYPES),
  destinationArn: z.string().min(1, "Choose a destination."),
});
