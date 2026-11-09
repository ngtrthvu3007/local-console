import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { marshall, NumberValueImpl, unmarshall } from "@aws-sdk/util-dynamodb";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes } from "@shared/format.ts";
import { prettyJson } from "@shared/json.ts";
import {
  ATTRIBUTE_VALUE_TYPES,
  BASE64_PATTERN,
  CELL_PREVIEW_MAX_LENGTH,
  KEY_TYPES,
  MAX_EXACT_SIGNIFICANT_DIGITS,
  NUMBER_TEXT_PATTERN,
  type ItemFormat,
} from "./constants.ts";
import type { IndexKeys, KeyAttribute } from "./hooks/useTables.ts";

// Đổi item giữa JSON thường và DynamoDB JSON mà không làm mất số lớn, Set, Binary

export type Item = Record<string, AttributeValue>;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const ELLIPSIS = "…";

// ---------- Binary ↔ base64 ----------

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

// ---------- Lý do phải dùng DynamoDB JSON ----------

function unsafeReason(value: AttributeValue): string | undefined {
  if (value.SS) return "a String Set";
  if (value.NS) return "a Number Set";
  if (value.BS) return "a Binary Set";
  if (value.B) return "binary data";
  if (value.N !== undefined && String(Number(value.N)) !== value.N) return `the number ${value.N}`;
  if (value.M) return firstUnsafeReason(Object.values(value.M));
  if (value.L) return firstUnsafeReason(value.L);
  return undefined;
}

function firstUnsafeReason(values: AttributeValue[]): string | undefined {
  for (const value of values) {
    const reason = unsafeReason(value);
    if (reason) return reason;
  }
  return undefined;
}

// Trả câu giải thích khi item chỉ sửa được bằng DynamoDB JSON, ngược lại undefined
export function needsDynamoJson(item: Item): string | undefined {
  const reason = firstUnsafeReason(Object.values(item));
  return (
    reason &&
    `Shown as DynamoDB JSON: this item has ${reason}, which plain JSON can't keep exactly.`
  );
}

// ---------- Item → chữ trong editor / file ----------

// DynamoDB JSON có thể ghi ra chữ: Binary thành base64
function encodeValue(value: AttributeValue): JsonValue {
  if (value.S !== undefined) return { S: value.S };
  if (value.N !== undefined) return { N: value.N };
  if (value.BOOL !== undefined) return { BOOL: value.BOOL };
  if (value.NULL !== undefined) return { NULL: value.NULL };
  if (value.SS) return { SS: value.SS };
  if (value.NS) return { NS: value.NS };
  if (value.B) return { B: toBase64(value.B) };
  if (value.BS) return { BS: value.BS.map(toBase64) };
  if (value.M) return { M: encodeItem(value.M) };
  return { L: (value.L ?? []).map(encodeValue) };
}

const encodeItem = (item: Item): { [key: string]: JsonValue } =>
  Object.fromEntries(Object.entries(item).map(([name, value]) => [name, encodeValue(value)]));

export const toEditorText = (item: Item, format: ItemFormat) =>
  prettyJson(format === "json" ? unmarshall(item) : encodeItem(item));

export const exportText = (items: Item[]) => prettyJson(items.map(encodeItem));

// ---------- Chữ → item ----------

// Đếm chữ số có nghĩa: "0.00012300" → 3, "12345678901234567890" → 20
function significantDigits(source: string): number {
  const mantissa = source.replace(/^-/, "").split(/[eE]/)[0].replace(".", "");
  return mantissa.replace(/^0+/, "").replace(/0+$/, "").length || 1;
}

// JSON.parse giữ được chữ gốc của số (context.source) trên trình duyệt mới.
// Số mà kiểu number làm tròn thì giữ nguyên chữ gốc (NumberValue), marshall ghi đúng thành {N: "<chữ gốc>"}
function exactNumberReviver(_key: string, value: unknown, context?: { source?: string }) {
  if (typeof value !== "number" || !context?.source) return value;
  const source = context.source;
  const isInteger = !/[.eE]/.test(source);
  const lost = isInteger
    ? !Number.isSafeInteger(value)
    : significantDigits(source) > MAX_EXACT_SIGNIFICANT_DIGITS;
  return lost ? new NumberValueImpl(source) : value;
}

function parseJson(text: string, format: ItemFormat): unknown {
  try {
    return format === "json" ? JSON.parse(text, exactNumberReviver) : JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON: ${error.message}`);
    throw error;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (path: string, problem: string): never => {
  throw new Error(`"${path}": ${problem}`);
};

const numberText = (path: string, value: unknown) =>
  typeof value === "string" && NUMBER_TEXT_PATTERN.test(value)
    ? value
    : fail(path, 'expected a number as text, e.g. {"N": "42"}.');

const binaryBytes = (path: string, value: unknown) =>
  typeof value === "string" && BASE64_PATTERN.test(value)
    ? fromBase64(value)
    : fail(path, 'expected base64 text, e.g. {"B": "aGVsbG8="}.');

const textList = (path: string, value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : fail(path, "expected a list of text values.");

// DynamoDB không nhận Set rỗng
const setList = (path: string, value: unknown) => {
  const entries = textList(path, value);
  return entries.length ? entries : fail(path, "a set can't be empty.");
};

// Kiểm tra một giá trị DynamoDB JSON: object đúng một khóa kiểu, dữ liệu đúng kiểu
function decodeValue(path: string, raw: unknown): AttributeValue {
  if (!isPlainObject(raw)) return fail(path, 'expected an object like {"S": "text"}.');
  const types = Object.keys(raw);
  if (types.length !== 1 || !ATTRIBUTE_VALUE_TYPES.includes(types[0])) {
    return fail(path, `expected exactly one of ${ATTRIBUTE_VALUE_TYPES.join(", ")}.`);
  }
  const [type] = types;
  const data = raw[type];
  switch (type) {
    case "S":
      return typeof data === "string" ? { S: data } : fail(path, "S must be text.");
    case "N":
      return { N: numberText(path, data) };
    case "B":
      return { B: binaryBytes(path, data) };
    case "BOOL":
      return typeof data === "boolean" ? { BOOL: data } : fail(path, "BOOL must be true or false.");
    case "NULL":
      return data === true ? { NULL: true } : fail(path, "NULL must be true.");
    case "M":
      return isPlainObject(data)
        ? { M: decodeItem(data, `${path}.`) }
        : fail(path, "M must be an object.");
    case "L":
      return Array.isArray(data)
        ? { L: data.map((entry, index) => decodeValue(`${path}[${index}]`, entry)) }
        : fail(path, "L must be a list.");
    case "SS":
      return { SS: setList(path, data) };
    case "NS":
      return { NS: setList(path, data).map((entry) => numberText(path, entry)) };
    default:
      return { BS: setList(path, data).map((entry) => binaryBytes(path, entry)) };
  }
}

const decodeItem = (raw: Record<string, unknown>, prefix = ""): Item =>
  Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, decodeValue(`${prefix}${name}`, value)]),
  );

function toItem(raw: unknown, format: ItemFormat): Item {
  if (!isPlainObject(raw)) throw new Error("The item must be a JSON object.");
  return format === "json" ? marshall(raw, { removeUndefinedValues: true }) : decodeItem(raw);
}

export const parseEditorText = (text: string, format: ItemFormat) =>
  toItem(parseJson(text, format), format);

// ---------- Key ----------

const KEY_TYPE_CHECKS: Record<KeyAttribute["type"], (value: AttributeValue) => boolean> = {
  S: (value) => value.S !== undefined,
  N: (value) => value.N !== undefined,
  B: (value) => value.B !== undefined,
};

const keyRoles = (keys: IndexKeys) =>
  [
    { role: "partition key", attribute: keys.partitionKey },
    keys.sortKey && { role: "sort key", attribute: keys.sortKey },
  ].filter((entry) => entry !== undefined);

// Thiếu key hoặc sai kiểu → câu báo lỗi
export function keyError(item: Item, keys: IndexKeys): string | undefined {
  for (const { role, attribute } of keyRoles(keys)) {
    const value = item[attribute.name];
    if (!value) return `Missing ${role} "${attribute.name}".`;
    if (!KEY_TYPE_CHECKS[attribute.type](value)) {
      return `The ${role} "${attribute.name}" must be a ${KEY_TYPES[attribute.type]}.`;
    }
    // DynamoDB không nhận key là chuỗi rỗng hoặc binary rỗng
    if (value.S === "" || value.B?.length === 0)
      return `The ${role} "${attribute.name}" can't be empty.`;
  }
  return undefined;
}

export const pickKey = (item: Item, keys: IndexKeys): Item =>
  Object.fromEntries(keyRoles(keys).map(({ attribute }) => [attribute.name, item[attribute.name]]));

// Định danh ổn định của item theo key (dùng cho trackBy của bảng)
export const itemId = (item: Item, keys: IndexKeys) =>
  JSON.stringify(encodeItem(pickKey(item, keys)));

export const keyChanged = (original: Item, next: Item, keys: IndexKeys) =>
  JSON.stringify(encodeItem(pickKey(original, keys))) !==
  JSON.stringify(encodeItem(pickKey(next, keys)));

// ---------- File import ----------

// Kiểm tra cả file trước khi ghi: item sai hoặc trùng key với item khác trong file thì báo số thứ tự
export function parseImportText(text: string, format: ItemFormat, keys: IndexKeys): Item[] {
  const raw = parseJson(text, format);
  if (!Array.isArray(raw)) throw new Error("The file must contain a JSON array of items.");
  const positionById = new Map<string, number>();
  return raw.map((entry, index) => {
    const position = index + 1;
    try {
      const item = toItem(entry, format);
      const error = keyError(item, keys);
      if (error) throw new Error(error);
      const id = itemId(item, keys);
      const firstPosition = positionById.get(id);
      if (firstPosition) throw new Error(`Same key as item ${firstPosition}.`);
      positionById.set(id, position);
      return item;
    } catch (error) {
      throw new Error(`Item ${position}: ${(error as Error).message}`);
    }
  });
}

// "pk = user#1 · sk = order#001": nhận ra item trong modal và trong báo lỗi
export const keyLabel = (item: Item, keys: IndexKeys) =>
  keyRoles(keys)
    .map(({ attribute }) => `${attribute.name} = ${cellText(item[attribute.name])}`)
    .join(DETAIL_SEPARATOR);

// ---------- Hiển thị trong ô bảng ----------

// JSON thu gọn giữ nguyên chữ của số (không qua kiểu number)
function compactText(value: AttributeValue): string {
  if (value.S !== undefined) return JSON.stringify(value.S);
  if (value.N !== undefined) return value.N;
  if (value.BOOL !== undefined) return String(value.BOOL);
  if (value.NULL) return "null";
  if (value.B) return `"Binary (${formatBytes(value.B.length)})"`;
  if (value.SS) return JSON.stringify(value.SS);
  if (value.NS) return `[${value.NS.join(",")}]`;
  if (value.BS)
    return `[${value.BS.map((bytes) => `"Binary (${formatBytes(bytes.length)})"`).join(",")}]`;
  if (value.L) return `[${value.L.map(compactText).join(",")}]`;
  if (value.M) {
    const entries = Object.entries(value.M).map(
      ([name, entry]) => `${JSON.stringify(name)}:${compactText(entry)}`,
    );
    return `{${entries.join(",")}}`;
  }
  return NOT_AVAILABLE;
}

const truncate = (text: string) =>
  text.length > CELL_PREVIEW_MAX_LENGTH
    ? `${text.slice(0, CELL_PREVIEW_MAX_LENGTH)}${ELLIPSIS}`
    : text;

export function cellText(value: AttributeValue | undefined): string {
  if (!value) return NOT_AVAILABLE;
  if (value.S !== undefined) return truncate(value.S);
  if (value.N !== undefined) return value.N;
  if (value.B) return `Binary (${formatBytes(value.B.length)})`;
  return truncate(compactText(value));
}

// Giá trị lồng nhau (Map, List, Set) in màu xám để key và giá trị chính nổi lên
export const isNestedValue = (value: AttributeValue | undefined) =>
  Boolean(value && (value.M || value.L || value.SS || value.NS || value.BS));
