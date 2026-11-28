import type { KeySchemaElement, TableDescription } from "@aws-sdk/client-dynamodb";
import { KEY_TYPE_HASH, KEY_TYPE_RANGE, type KeyType } from "./constants.ts";

export interface KeyAttribute {
  name: string;
  type: KeyType;
}

export interface IndexKeys {
  partitionKey: KeyAttribute;
  sortKey?: KeyAttribute;
}

// Key của bảng, hoặc của GSI/LSI tên indexName; kiểu lấy từ AttributeDefinitions của bảng
export function keySchemaOf(table: TableDescription, indexName?: string): IndexKeys {
  const indexes = [...(table.GlobalSecondaryIndexes ?? []), ...(table.LocalSecondaryIndexes ?? [])];

  const schema = indexName
    ? indexes.find((index) => index.IndexName === indexName)?.KeySchema
    : table.KeySchema;

  const attributeOf = (element?: KeySchemaElement): KeyAttribute | undefined => {
    if (!element?.AttributeName) return undefined;

    const definition = table.AttributeDefinitions?.find(
      (attribute) => attribute.AttributeName === element.AttributeName,
    );

    return { name: element.AttributeName, type: definition?.AttributeType as KeyType };
  };

  return {
    partitionKey: attributeOf(schema?.find((element) => element.KeyType === KEY_TYPE_HASH))!,
    sortKey: attributeOf(schema?.find((element) => element.KeyType === KEY_TYPE_RANGE)),
  };
}

// Key của bảng/index theo thứ tự partition key rồi sort key (nếu có)
export const keyAttributesOf = (keys: IndexKeys) =>
  [keys.partitionKey, keys.sortKey].filter((key) => key !== undefined);

export const indexCountOf = (table: TableDescription) =>
  (table.GlobalSecondaryIndexes?.length ?? 0) + (table.LocalSecondaryIndexes?.length ?? 0);
