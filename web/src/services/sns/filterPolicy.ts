import { NOT_AVAILABLE } from "@shared/constants.ts";
import { truncate } from "@shared/format.ts";
import { jsonObjectError } from "@shared/json.ts";
import { FILTER_SUMMARY_MAX_LENGTH } from "./constants.ts";

const VALUE_SEPARATOR = " | ";
const KEY_SEPARATOR = ", ";

// Giá trị trong policy: chuỗi, số, hoặc operator như {"prefix": "a"}
const valueText = (value: unknown): string =>
  typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);

// {"type": ["order"], "region": ["us", "eu"]} → "type = order, region = us | eu"
export function summarizeFilterPolicy(text?: string): string {
  if (!text) return NOT_AVAILABLE;
  // Không phải object JSON (kể cả chỉ có khoảng trắng) thì hiện nguyên văn
  if (!text.trim() || jsonObjectError(text)) return text;
  const summary = Object.entries(JSON.parse(text))
    .map(([key, values]) =>
      Array.isArray(values) ? `${key} = ${values.map(valueText).join(VALUE_SEPARATOR)}` : key,
    )
    .join(KEY_SEPARATOR);
  return truncate(summary, FILTER_SUMMARY_MAX_LENGTH);
}

// Rỗng = bỏ filter. Luật chi tiết của policy do SNS kiểm, lỗi gốc hiện trong modal
export const filterPolicyError = (text: string) =>
  jsonObjectError(text, "A filter policy is a JSON object.");
