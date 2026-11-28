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
