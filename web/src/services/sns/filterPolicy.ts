import { NOT_AVAILABLE } from "@shared/constants.ts";
import { jsonError } from "@shared/json.ts";
import { FILTER_SUMMARY_MAX_LENGTH } from "./constants.ts";

const VALUE_SEPARATOR = " | ";
const KEY_SEPARATOR = ", ";
const ELLIPSIS = "…";

// Giá trị trong policy: chuỗi, số, hoặc operator như {"prefix": "a"}
const valueText = (value: unknown): string =>
  typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);

// {"type": ["order"], "region": ["us", "eu"]} → "type = order, region = us | eu"
export function summarizeFilterPolicy(text?: string): string {
  if (!text) return NOT_AVAILABLE;
  let policy: unknown;
  try {
    policy = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return text;
  const summary = Object.entries(policy)
    .map(([key, values]) =>
      Array.isArray(values) ? `${key} = ${values.map(valueText).join(VALUE_SEPARATOR)}` : key,
    )
    .join(KEY_SEPARATOR);
  return summary.length > FILTER_SUMMARY_MAX_LENGTH
    ? `${summary.slice(0, FILTER_SUMMARY_MAX_LENGTH)}${ELLIPSIS}`
    : summary;
}

// Rỗng = bỏ filter. Luật chi tiết của policy do SNS kiểm, lỗi gốc hiện trong modal
export function filterPolicyError(text: string): string | undefined {
  if (!text.trim()) return undefined;
  const syntax = jsonError(text);
  if (syntax) return syntax;
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? undefined
    : "A filter policy is a JSON object.";
}
