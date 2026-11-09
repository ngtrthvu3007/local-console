import { z } from "zod";
import { formatBytes } from "@shared/format.ts";
import { startingPositionSchema, streamBatchSizeSchema } from "../lambda/schemas.ts";
import {
  BOOLEAN_TEXTS,
  IMPORT_FILE_EXTENSION,
  IMPORT_MAX_BYTES,
  ITEM_FORMATS,
  NUMBER_TEXT_PATTERN,
  FILTER_OPERATORS,
  FILTER_VALUE_TYPES,
  KEY_TYPES,
  SEARCH_MODES,
  SORT_KEY_OPERATORS,
  STREAM_VIEW_TYPES,
  type StreamViewTypeId,
  TABLE_NAME_LENGTH,
  TABLE_NAME_PATTERN,
  VALUELESS_FILTER_OPERATORS,
  type FilterOperator,
  type FilterValueType,
  type KeyType,
  type SearchMode,
  type SortKeyOperator,
} from "./constants.ts";
import type { IndexKeys } from "./hooks/useTables.ts";

const KEY_TYPE_IDS = Object.keys(KEY_TYPES) as [KeyType, ...KeyType[]];

// Tên bảng và tên index cùng một luật
const resourceName = (noun: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${noun} name.`)
    .min(TABLE_NAME_LENGTH.min, `Must be at least ${TABLE_NAME_LENGTH.min} characters.`)
    .max(TABLE_NAME_LENGTH.max, `Must be at most ${TABLE_NAME_LENGTH.max} characters.`)
    .regex(
      TABLE_NAME_PATTERN,
      "Use only letters, numbers, underscores (_), hyphens (-) and dots (.).",
    );

const keyField = z.object({ name: z.string().trim(), type: z.enum(KEY_TYPE_IDS) });

export const createTableSchema = z
  .object({
    name: resourceName("table"),
    partitionKey: keyField,
    // Sort key để trống tên = không có sort key
    sortKey: keyField,
    indexes: z.array(
      z.object({ name: z.string().trim(), partitionKey: keyField, sortKey: keyField }),
    ),
  })
  .superRefine((values, context) => {
    const addIssue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });
    if (!values.partitionKey.name)
      addIssue(["partitionKey", "name"], "Enter a partition key name.");

    // DynamoDB bắt buộc: cùng một tên attribute thì cùng kiểu, ở bảng và mọi index
    const typeByName = new Map<string, KeyType>();
    const checkType = (key: z.infer<typeof keyField>, path: (string | number)[]) => {
      if (!key.name) return;
      const knownType = typeByName.get(key.name);
      if (knownType && knownType !== key.type) {
        addIssue(path, `"${key.name}" is already a ${KEY_TYPES[knownType]} key.`);
        return;
      }
      typeByName.set(key.name, key.type);
    };
    checkType(values.partitionKey, ["partitionKey", "type"]);
    checkType(values.sortKey, ["sortKey", "type"]);

    const indexNames = new Set<string>();
    values.indexes.forEach((index, position) => {
      const nameResult = resourceName("index").safeParse(index.name);
      if (!nameResult.success)
        addIssue(["indexes", position, "name"], nameResult.error.issues[0].message);
      else if (indexNames.has(index.name))
        addIssue(["indexes", position, "name"], "Duplicate index name.");
      indexNames.add(index.name);
      if (!index.partitionKey.name) {
        addIssue(["indexes", position, "partitionKey", "name"], "Enter a partition key name.");
      }
      checkType(index.partitionKey, ["indexes", position, "partitionKey", "type"]);
      checkType(index.sortKey, ["indexes", position, "sortKey", "type"]);
    });
  });

export type CreateTableForm = z.input<typeof createTableSchema>;

// ---------- Điều kiện tìm item ----------

const enumOf = <T extends string>(record: Record<T, string>) =>
  z.enum(Object.keys(record) as [T, ...T[]]);

// Giá trị nhập phải hợp với kiểu: Number là số, Boolean là true/false
function valueProblem(type: KeyType | FilterValueType, value: string): string | undefined {
  if (type === "N" && !NUMBER_TEXT_PATTERN.test(value.trim())) return "Enter a number.";
  if (type === "BOOL" && !BOOLEAN_TEXTS.includes(value.trim())) return "Enter true or false.";
  return undefined;
}

export const itemSearchSchema = (keysFor: (indexName: string) => IndexKeys) =>
  z
    .object({
      mode: z.enum([SEARCH_MODES.scan, SEARCH_MODES.query] as [SearchMode, SearchMode]),
      indexName: z.string(), // "" = bảng
      partitionKeyValue: z.string(),
      sortKey: z.object({
        operator: enumOf<SortKeyOperator>(SORT_KEY_OPERATORS),
        value: z.string(),
        secondValue: z.string(),
      }),
      filters: z.array(
        z.object({
          attribute: z.string(),
          operator: enumOf<FilterOperator>(FILTER_OPERATORS),
          type: enumOf<FilterValueType>(FILTER_VALUE_TYPES),
          value: z.string(),
          secondValue: z.string(),
        }),
      ),
      descending: z.boolean(),
    })
    .superRefine((values, context) => {
      const addIssue = (path: (string | number)[], message: string) =>
        context.addIssue({ code: "custom", path, message });
      const keys = keysFor(values.indexName);
      if (values.mode === SEARCH_MODES.query) {
        if (!values.partitionKeyValue.trim()) {
          addIssue(["partitionKeyValue"], `Enter a value for ${keys.partitionKey.name}.`);
        } else {
          const problem = valueProblem(keys.partitionKey.type, values.partitionKeyValue);
          if (problem) addIssue(["partitionKeyValue"], problem);
        }
        const sortKey = keys.sortKey;
        if (sortKey && values.sortKey.value.trim()) {
          if (values.sortKey.operator === "begins_with" && sortKey.type !== "S") {
            addIssue(["sortKey", "operator"], "Begins with works only on String keys.");
          }
          const problem = valueProblem(sortKey.type, values.sortKey.value);
          if (problem) addIssue(["sortKey", "value"], problem);
          if (values.sortKey.operator === "between") {
            const endProblem = !values.sortKey.secondValue.trim()
              ? "Enter the end of the range."
              : valueProblem(sortKey.type, values.sortKey.secondValue);
            if (endProblem) addIssue(["sortKey", "secondValue"], endProblem);
          }
        }
      }
      values.filters.forEach((filter, index) => {
        if (!filter.attribute.trim())
          addIssue(["filters", index, "attribute"], "Enter an attribute name.");
        if (VALUELESS_FILTER_OPERATORS.includes(filter.operator)) return;
        const problem = valueProblem(filter.type, filter.value);
        if (problem) addIssue(["filters", index, "value"], problem);
        if (filter.operator === "between") {
          const endProblem = !filter.secondValue.trim()
            ? "Enter the end of the range."
            : valueProblem(filter.type, filter.secondValue);
          if (endProblem) addIssue(["filters", index, "secondValue"], endProblem);
        }
      });
    });

export type ItemSearchForm = z.input<ReturnType<typeof itemSearchSchema>>;

// ---------- Import ----------

export const importTooLargeMessage = `The file must be at most ${formatBytes(IMPORT_MAX_BYTES)}.`;

// zod vẫn chạy refine khi length(1) đã hỏng, nên kiểm bằng every để không lỗi khi chưa có file
export const importSchema = z.object({
  files: z
    .array(z.instanceof(File))
    .length(1, "Choose a .json file.")
    .refine(
      (files) => files.every((file) => file.name.toLowerCase().endsWith(IMPORT_FILE_EXTENSION)),
      "The file must be a .json file.",
    )
    .refine((files) => files.every((file) => file.size <= IMPORT_MAX_BYTES), importTooLargeMessage),
  format: z.enum([ITEM_FORMATS.dynamodb, ITEM_FORMATS.json]),
});

// ---------- TTL, Stream, trigger từ trang bảng ----------

export const ttlSchema = z
  .object({ enabled: z.boolean(), attributeName: z.string().trim() })
  .refine((values) => !values.enabled || values.attributeName, {
    message: "Enter the attribute that holds the expiry time.",
    path: ["attributeName"],
  });

export const streamSchema = z.object({
  enabled: z.boolean(),
  viewType: z.enum(Object.keys(STREAM_VIEW_TYPES) as [StreamViewTypeId, ...StreamViewTypeId[]]),
});

export const streamTriggerSchema = z.object({
  functionName: z.string().min(1, "Choose a function."),
  startingPosition: startingPositionSchema,
  batchSize: streamBatchSizeSchema,
  enabled: z.boolean(),
});
