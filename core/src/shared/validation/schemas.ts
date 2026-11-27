import { z } from "zod";
import { jsonError, jsonObjectError } from "#shared/utils/json.ts";

interface WholeNumberRange {
  min: number;
  max?: number;
}

export const enumOfKeys = <T extends string>(record: Record<T, unknown>) =>
  z.enum(Object.keys(record) as [T, ...T[]]);

// Input của Cloudscape luôn trả chuỗi; không dùng z.coerce vì "" thành 0
export function isWholeNumberIn(text: string, { min, max = Infinity }: WholeNumberRange) {
  const value = Number(text);
  return text !== "" && Number.isInteger(value) && value >= min && value <= max;
}

export const wholeNumberIn = (range: Required<WholeNumberRange>, unit?: string) =>
  z
    .string()
    .trim()
    .refine(
      (text) => isWholeNumberIn(text, range),
      `Enter a whole number from ${range.min} to ${range.max}${unit ? ` ${unit}` : ""}.`,
    )
    .transform(Number);

export const optionalWholeNumber = (range: WholeNumberRange, message: string) =>
  z
    .string()
    .trim()
    .refine((text) => !text || isWholeNumberIn(text, range), message)
    .transform((text) => (text ? Number(text) : undefined));

const checkedText = (check: (text: string) => string | undefined) =>
  z
    .string()
    .trim()
    .superRefine((text, context) => {
      const message = check(text);
      if (message) context.addIssue({ code: "custom", message });
    });

export const jsonText = checkedText(jsonError);
export const jsonObjectText = checkedText(jsonObjectError);

const LOWERCASE_NAME = /^[a-z][a-z0-9-]*$/;
const DOUBLE_HYPHEN = "--";
const HYPHEN = "-";

// Tên kiểu RDS identifier / ElastiCache cluster: chữ thường, số, "-"; không "--", không kết thúc bằng "-"
export const lowercaseName = (label: string, maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(maxLength, `Must be at most ${maxLength} characters.`)
    .regex(LOWERCASE_NAME, "Start with a letter; use lowercase letters, numbers and hyphens.")
    .refine((name) => !name.includes(DOUBLE_HYPHEN), "Can't contain two hyphens in a row.")
    .refine((name) => !name.endsWith(HYPHEN), "Can't end with a hyphen.");

export type AddIssue = (path: string | (string | number)[], message: string) => void;

// addIssue của superRefine gọn lại thành (ô, lỗi); ô là tên field hoặc path đầy đủ
export const issueAdder =
  (context: z.RefinementCtx): AddIssue =>
  (path, message) =>
    context.addIssue({ code: "custom", path: Array.isArray(path) ? path : [path], message });
