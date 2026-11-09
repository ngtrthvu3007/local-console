import { z } from "zod";
import { REDIS_KEY_TYPES } from "@server/routes/redis/contract.ts";
import {
  CLUSTER_NAME_MAX_LENGTH,
  CLUSTER_NAME_PATTERN,
  DOUBLE_HYPHEN,
  ENGINE_LABELS,
  HYPHEN,
} from "./constants.ts";

const ENGINES = Object.keys(ENGINE_LABELS) as [string, ...string[]];

export const createClusterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a cluster name.")
    .max(CLUSTER_NAME_MAX_LENGTH, `Must be at most ${CLUSTER_NAME_MAX_LENGTH} characters.`)
    .regex(CLUSTER_NAME_PATTERN, "Start with a letter; use lowercase letters, numbers and hyphens.")
    .refine((name) => !name.includes(DOUBLE_HYPHEN), "Can't contain two hyphens in a row.")
    .refine((name) => !name.endsWith(HYPHEN), "Can't end with a hyphen."),
  engine: z.enum(ENGINES),
});
export type CreateClusterForm = z.input<typeof createClusterSchema>;

// Input của Cloudscape luôn trả chuỗi
const ttlText = z
  .string()
  .trim()
  .refine((text) => text === "" || (Number.isInteger(Number(text)) && Number(text) > 0), {
    message: "Enter a whole number of seconds greater than 0.",
  })
  .transform((text) => (text === "" ? null : Number(text)));

// Score của sorted set: số bất kỳ (kể cả âm, thập phân)
const isNumberText = (text: string) => text.trim() !== "" && Number.isFinite(Number(text));
const NUMBER_MESSAGE = "Enter a number.";

export const createKeySchema = z
  .object({
    name: z.string().min(1, "Enter a key."),
    type: z.enum(REDIS_KEY_TYPES),
    field: z.string(),
    value: z.string(),
    score: z.string(),
    ttl: ttlText,
  })
  .superRefine((form, context) => {
    if (form.type === "hash" && !form.field) {
      context.addIssue({ code: "custom", path: ["field"], message: "Enter a field." });
    }
    if (form.type === "zset" && !isNumberText(form.score)) {
      context.addIssue({ code: "custom", path: ["score"], message: NUMBER_MESSAGE });
    }
  });
export type CreateKeyForm = z.input<typeof createKeySchema>;

export const TTL_MODES = { none: "none", expire: "expire" } as const;

export const ttlSchema = z
  .object({ mode: z.enum([TTL_MODES.none, TTL_MODES.expire]), seconds: z.string() })
  .superRefine((form, context) => {
    if (form.mode !== TTL_MODES.expire) return;
    const seconds = Number(form.seconds.trim());
    if (!form.seconds.trim() || !Number.isInteger(seconds) || seconds <= 0) {
      context.addIssue({
        code: "custom",
        path: ["seconds"],
        message: "Enter a whole number of seconds greater than 0.",
      });
    }
  })
  // null = bỏ hạn
  .transform((form) => ({
    seconds: form.mode === TTL_MODES.expire ? Number(form.seconds.trim()) : null,
  }));
export type TtlForm = z.input<typeof ttlSchema>;

// Form thêm/sửa một phần tử: field (hash), member (set, sorted set), score (sorted set),
// value (hash, list), end (push vào list). Trường không dùng thì để trống.
export const LIST_ENDS = { head: "head", tail: "tail" } as const;
export type CollectionKind = "hash" | "list" | "set" | "zset";

const elementFields = z.object({
  field: z.string(),
  member: z.string(),
  value: z.string(),
  score: z.string(),
  end: z.enum([LIST_ENDS.head, LIST_ENDS.tail]),
});
export type ElementForm = z.infer<typeof elementFields>;

// Khi sửa, field/member là cố định nên không kiểm tra
export const elementSchemaFor = (kind: CollectionKind, editing: boolean) =>
  elementFields.superRefine((form, context) => {
    if (!editing && kind === "hash" && !form.field) {
      context.addIssue({ code: "custom", path: ["field"], message: "Enter a field." });
    }
    if (!editing && (kind === "set" || kind === "zset") && !form.member) {
      context.addIssue({ code: "custom", path: ["member"], message: "Enter a member." });
    }
    if (kind === "zset" && !isNumberText(form.score)) {
      context.addIssue({ code: "custom", path: ["score"], message: NUMBER_MESSAGE });
    }
  });
