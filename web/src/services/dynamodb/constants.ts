import type { KeyType as KeyRole } from "@aws-sdk/client-dynamodb";

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 * KIBIBYTE;

// Kiểu dữ liệu được phép làm key (DynamoDB chỉ cho String, Number, Binary)
export const KEY_TYPES = { S: "String", N: "Number", B: "Binary" } as const;
export type KeyType = keyof typeof KEY_TYPES;

// Luật đặt tên bảng và index của DynamoDB
export const TABLE_NAME_LENGTH = { min: 3, max: 255 } as const;
export const TABLE_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export const TABLE_STATUS_ACTIVE = "ACTIVE";
export const BILLING_MODE_ON_DEMAND = "PAY_PER_REQUEST";
export const PROJECTION_ALL = "ALL";
// Vai trò của key trong KeySchema: partition key (HASH) và sort key (RANGE)
export const KEY_TYPE_HASH: KeyRole = "HASH";
export const KEY_TYPE_RANGE: KeyRole = "RANGE";

export const ITEMS_PAGE_SIZE = 50;

// Ngăn câu điều kiện với kết quả: "Scan on orders — 50 returned"
export const RESULT_SEPARATOR = " — ";
// Số viết dạng chữ của DynamoDB: 42, -1.5, 1e3
export const NUMBER_TEXT_PATTERN = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
// Giới hạn của BatchWriteItem
export const BATCH_WRITE_MAX_ITEMS = 25;
export const UNPROCESSED_RETRY_LIMIT = 5;
export const IMPORT_MAX_BYTES = 10 * MEBIBYTE;
export const IMPORT_FILE_EXTENSION = ".json";

// Dạng hiển thị item trong editor và file import
export const ITEM_FORMATS = { json: "json", dynamodb: "dynamodb" } as const;
export type ItemFormat = (typeof ITEM_FORMATS)[keyof typeof ITEM_FORMATS];
export const ITEM_FORMAT_LABELS: Record<ItemFormat, string> = {
  json: "JSON",
  dynamodb: "DynamoDB JSON",
};

// Mọi kiểu giá trị của DynamoDB JSON
export const ATTRIBUTE_VALUE_TYPES = ["S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"];
// Số có nhiều hơn 15 chữ số có nghĩa thì kiểu number của JavaScript có thể làm tròn
export const MAX_EXACT_SIGNIFICANT_DIGITS = 15;
export const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
export const CELL_PREVIEW_MAX_LENGTH = 80;

// Điều kiện tìm item
export const SEARCH_MODES = { scan: "scan", query: "query" } as const;
export type SearchMode = (typeof SEARCH_MODES)[keyof typeof SEARCH_MODES];

export const SORT_KEY_OPERATORS = {
  "=": "=",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  begins_with: "Begins with",
  between: "Between",
} as const;
export type SortKeyOperator = keyof typeof SORT_KEY_OPERATORS;

export const FILTER_OPERATORS = {
  "=": "=",
  "<>": "≠",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  begins_with: "Begins with",
  contains: "Contains",
  between: "Between",
  exists: "Exists",
  not_exists: "Not exists",
} as const;
export type FilterOperator = keyof typeof FILTER_OPERATORS;
// Hai phép này không cần giá trị
export const VALUELESS_FILTER_OPERATORS: FilterOperator[] = ["exists", "not_exists"];

export const FILTER_VALUE_TYPES = { S: "String", N: "Number", BOOL: "Boolean" } as const;
export type FilterValueType = keyof typeof FILTER_VALUE_TYPES;
export const BOOLEAN_TEXTS = ["true", "false"];

// Stream
export const STREAM_VIEW_TYPES = {
  NEW_AND_OLD_IMAGES: "New and old images",
  NEW_IMAGE: "New image",
  OLD_IMAGE: "Old image",
  KEYS_ONLY: "Keys only",
} as const;
export type StreamViewTypeId = keyof typeof STREAM_VIEW_TYPES;
export const DEFAULT_STREAM_VIEW_TYPE: StreamViewTypeId = "NEW_AND_OLD_IMAGES";

export const TTL_STATUS_ENABLED = "ENABLED";

export const PROJECTION_LABELS: Record<string, string> = {
  ALL: "All attributes",
  KEYS_ONLY: "Keys only",
  INCLUDE: "Selected attributes",
};
