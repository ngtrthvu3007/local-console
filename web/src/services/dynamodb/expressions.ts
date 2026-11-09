import type { AttributeValue, QueryCommandInput, ScanCommandInput } from "@aws-sdk/client-dynamodb";
import {
  VALUELESS_FILTER_OPERATORS,
  type FilterOperator,
  type FilterValueType,
  type KeyType,
  type SearchMode,
  type SortKeyOperator,
} from "./constants.ts";
import type { IndexKeys } from "./hooks/useTables.ts";
import { fromBase64 } from "./itemJson.ts";

// Dựng input của Scan/Query từ điều kiện người dùng nhập.
// Tên và giá trị luôn đi qua #placeholder / :placeholder, nên tên trùng từ khóa
// dành riêng của DynamoDB (status, name, data, count…) vẫn chạy.

export interface SortKeyCondition {
  operator: SortKeyOperator;
  value: string;
  secondValue: string; // chỉ dùng cho between
}

export interface FilterCondition {
  attribute: string;
  operator: FilterOperator;
  type: FilterValueType;
  value: string;
  secondValue: string;
}

export interface ItemSearch {
  mode: SearchMode;
  indexName?: string; // không có = bảng
  partitionKeyValue: string;
  sortKey?: SortKeyCondition; // không có hoặc value rỗng = không lọc sort key
  filters: FilterCondition[];
  descending: boolean;
}

const KEY_VALUE_BUILDERS: Record<KeyType, (text: string) => AttributeValue> = {
  S: (text) => ({ S: text }),
  N: (text) => ({ N: text.trim() }),
  B: (text) => ({ B: fromBase64(text.trim()) }),
};

const FILTER_VALUE_BUILDERS: Record<FilterValueType, (text: string) => AttributeValue> = {
  S: (text) => ({ S: text }),
  N: (text) => ({ N: text.trim() }),
  BOOL: (text) => ({ BOOL: text.trim() === "true" }),
};

const FUNCTION_OPERATORS: FilterOperator[] = ["begins_with", "contains"];

// "#name <op> :value", hàm hoặc BETWEEN theo phép so sánh
function comparison(operator: FilterOperator, name: string, value: string, endValue: string) {
  if (operator === "exists") return `attribute_exists(${name})`;
  if (operator === "not_exists") return `attribute_not_exists(${name})`;
  if (operator === "between") return `${name} BETWEEN ${value} AND ${endValue}`;
  if (FUNCTION_OPERATORS.includes(operator)) return `${operator}(${name}, ${value})`;
  return `${name} ${operator} ${value}`;
}

export function buildSearchInput(
  table: string,
  search: ItemSearch,
  keys: IndexKeys,
): ScanCommandInput | QueryCommandInput {
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};

  const filterExpressions = search.filters.map((filter, index) => {
    const name = `#filter${index}`;
    const value = `:filter${index}`;
    const endValue = `:filter${index}end`;
    names[name] = filter.attribute.trim();
    if (!VALUELESS_FILTER_OPERATORS.includes(filter.operator))
      values[value] = FILTER_VALUE_BUILDERS[filter.type](filter.value);
    if (filter.operator === "between") {
      values[endValue] = FILTER_VALUE_BUILDERS[filter.type](filter.secondValue);
    }
    return comparison(filter.operator, name, value, endValue);
  });

  const input: ScanCommandInput & QueryCommandInput = {
    TableName: table,
    IndexName: search.indexName,
  };
  if (filterExpressions.length) input.FilterExpression = filterExpressions.join(" AND ");

  if (search.mode === "query") {
    names["#key0"] = keys.partitionKey.name;
    values[":key0"] = KEY_VALUE_BUILDERS[keys.partitionKey.type](search.partitionKeyValue);
    let keyCondition = "#key0 = :key0";
    const sortKey = search.sortKey;
    if (keys.sortKey && sortKey?.value.trim()) {
      const buildValue = KEY_VALUE_BUILDERS[keys.sortKey.type];
      names["#key1"] = keys.sortKey.name;
      values[":key1"] = buildValue(sortKey.value);
      if (sortKey.operator === "between") values[":key1end"] = buildValue(sortKey.secondValue);
      keyCondition += ` AND ${comparison(sortKey.operator, "#key1", ":key1", ":key1end")}`;
    }
    input.KeyConditionExpression = keyCondition;
    input.ScanIndexForward = !search.descending;
  }

  if (Object.keys(names).length) input.ExpressionAttributeNames = names;
  if (Object.keys(values).length) input.ExpressionAttributeValues = values;
  return input;
}
