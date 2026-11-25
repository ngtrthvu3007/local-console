import { z } from "zod";
import { byteLength } from "@shared/format.ts";
import { enumOfKeys, isWholeNumberIn } from "@shared/schemas.ts";
import {
  ITERATOR_TYPES,
  PARTITION_KEY_MAX_LENGTH,
  SHARD_COUNT,
  STREAM_MODES,
  STREAM_NAME_MAX_LENGTH,
  STREAM_NAME_PATTERN,
} from "./constants.ts";

export const createStreamSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(
        STREAM_NAME_PATTERN,
        `Use 1–${STREAM_NAME_MAX_LENGTH} letters, numbers, underscores (_), periods (.) or hyphens (-).`,
      ),
    mode: enumOfKeys(STREAM_MODES),
    shards: z.string().trim(),
  })
  // On-demand tự chia shard: chỉ Provisioned mới cần số shard
  .superRefine((form, context) => {
    if (form.mode === "PROVISIONED" && !isWholeNumberIn(form.shards, SHARD_COUNT)) {
      context.addIssue({
        code: "custom",
        path: ["shards"],
        message: `Enter a whole number of at least ${SHARD_COUNT.min}.`,
      });
    }
  })
  .transform((form) => ({ ...form, shards: Number(form.shards) }));

export type CreateStreamForm = z.input<typeof createStreamSchema>;
export type NewStream = z.output<typeof createStreamSchema>;

// Giới hạn data theo MaxRecordSizeInKiB của stream, đếm byte UTF-8 như AWS
export const putRecordSchema = (maxBytes: number) =>
  z.object({
    partitionKey: z
      .string()
      .min(1, "Enter a partition key.")
      .max(PARTITION_KEY_MAX_LENGTH, `Must be at most ${PARTITION_KEY_MAX_LENGTH} characters.`),
    data: z
      .string()
      .min(1, "Enter the data.")
      .refine((text) => byteLength(text) <= maxBytes, `Must be at most ${maxBytes} bytes.`),
  });

const isDate = (text: string) => !Number.isNaN(new Date(text).getTime());

export const dataViewerSchema = z
  .object({
    shardId: z.string().min(1, "Choose a shard."),
    position: enumOfKeys(ITERATOR_TYPES),
    timestamp: z.string().trim(),
  })
  .superRefine((form, context) => {
    if (form.position === "AT_TIMESTAMP" && !isDate(form.timestamp)) {
      context.addIssue({
        code: "custom",
        path: ["timestamp"],
        message: "Enter a date and time, e.g. 2026-11-25 09:00:00.",
      });
    }
  });

export type DataViewerForm = z.input<typeof dataViewerSchema>;
