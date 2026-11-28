import { z } from "zod";
import { kmsKeyIdSchema } from "#services/kms/schemas.ts";
import type { DescribeSecretResponse, RotationRulesType } from "@aws-sdk/client-secrets-manager";
import { enumOfKeys, isWholeNumberIn } from "#shared/validation/schemas.ts";
import {
  DEFAULT_ROTATION_DAYS,
  ROTATION_DAYS,
  ROTATION_RATE_PATTERN,
  SCHEDULE_EXPRESSION_PATTERN,
  SCHEDULE_TYPES,
  SECRET_NAME_MAX_LENGTH,
  SECRET_NAME_PATTERN,
  SECRET_TYPES,
  rotationRate,
} from "./constants.ts";

// Không trim key: lưu lại phải giữ đúng tên key app đang đọc
const entrySchema = z.object({ key: z.string(), value: z.string() });

const addKeyIssues = (entries: readonly { key: string }[], context: z.RefinementCtx) => {
  const seenKeys = new Set<string>();

  entries.forEach(({ key }, index) => {
    const message = !key.trim() ? "Enter a key." : seenKeys.has(key) ? "Duplicate key." : undefined;

    seenKeys.add(key);
    if (message) context.addIssue({ code: "custom", path: ["entries", index, "key"], message });
  });
};

export const keyValueSchema = z
  .object({ entries: z.array(entrySchema) })
  .superRefine(({ entries }, context) => addKeyIssues(entries, context));

export const createSecretSchema = z
  .object({
    type: enumOfKeys(SECRET_TYPES),
    entries: z.array(entrySchema),
    plaintext: z.string(),
    name: z.string().trim(),
    description: z.string().trim(),
    kmsKeyId: kmsKeyIdSchema,
  })
  .superRefine(({ type, entries, name }, context) => {
    const nameIssue = !name
      ? "Enter a secret name."
      : name.length > SECRET_NAME_MAX_LENGTH
        ? `Must be at most ${SECRET_NAME_MAX_LENGTH} characters.`
        : !SECRET_NAME_PATTERN.test(name)
          ? "Use only letters, numbers and / _ + = . @ -"
          : undefined;

    if (nameIssue) context.addIssue({ code: "custom", path: ["name"], message: nameIssue });
    if (type === "keyValue") addKeyIssues(entries, context);
  });

export type CreateSecretForm = z.input<typeof createSecretSchema>;

export const descriptionSchema = z.object({ description: z.string().trim() });

export const plaintextSchema = z.object({ plaintext: z.string() });

export const rotationSchema = z
  .object({
    enabled: z.boolean(),
    lambdaArn: z.string(),
    scheduleType: enumOfKeys(SCHEDULE_TYPES),
    days: z.string().trim(),
    expression: z.string().trim(),
  })
  .superRefine(({ enabled, lambdaArn, scheduleType, days, expression }, context) => {
    if (!enabled) return;
    if (!lambdaArn)
      context.addIssue({ code: "custom", path: ["lambdaArn"], message: "Choose a function." });

    if (scheduleType === "days" && !isWholeNumberIn(days, ROTATION_DAYS)) {
      context.addIssue({
        code: "custom",
        path: ["days"],
        message: `Enter a whole number from ${ROTATION_DAYS.min} to ${ROTATION_DAYS.max}.`,
      });
    }

    if (scheduleType === "expression" && !SCHEDULE_EXPRESSION_PATTERN.test(expression)) {
      context.addIssue({
        code: "custom",
        path: ["expression"],
        message: "Enter a rate(…) or cron(…) expression.",
      });
    }
  })
  .transform((values) => ({
    ...values,
    scheduleExpression:
      values.scheduleType === "days" ? rotationRate(Number(values.days)) : values.expression,
  }));

type RotationForm = z.input<typeof rotationSchema>;

// Lịch đang lưu: ScheduleExpression, hoặc AutomaticallyAfterDays (CDK) đổi về rate(N days)
export function scheduleOf(rules: RotationRulesType = {}): string | undefined {
  if (rules.ScheduleExpression) return rules.ScheduleExpression;
  return rules.AutomaticallyAfterDays ? rotationRate(rules.AutomaticallyAfterDays) : undefined;
}

export function rotationFormValues(secret: DescribeSecretResponse): RotationForm {
  const schedule = scheduleOf(secret.RotationRules);
  const days = schedule && ROTATION_RATE_PATTERN.exec(schedule)?.[1];

  return {
    enabled: Boolean(secret.RotationEnabled),
    lambdaArn: secret.RotationLambdaARN ?? "",
    scheduleType: schedule && !days ? "expression" : "days",
    days: days || DEFAULT_ROTATION_DAYS,
    expression: days ? "" : (schedule ?? ""),
  };
}
