import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Item } from "./itemJson.ts";
import type { IndexKeys } from "./keys.ts";
import {
  deleteItems,
  getItem,
  importItems,
  putItem,
  scanAllItems,
  searchItems,
  type ItemSearchInput,
  type PutItemInput,
} from "./operations/items.ts";
import {
  getTimeToLive,
  updateStream,
  updateTimeToLive,
  type StreamChange,
  type TimeToLiveChange,
} from "./operations/settings.ts";
import {
  createTable,
  deleteTables,
  getTable,
  listTables,
  type CreateTableInput,
} from "./operations/tables.ts";

export function createDynamoDbService(dynamodb: DynamoDBClient) {
  return {
    listTables: () => listTables(dynamodb),
    getTable: (table: string) => getTable(dynamodb, table),
    createTable: (input: CreateTableInput) => createTable(dynamodb, input),
    deleteTables: (tables: readonly string[]) => deleteTables(dynamodb, tables),
    getTimeToLive: (table: string) => getTimeToLive(dynamodb, table),
    updateTimeToLive: (table: string, change: TimeToLiveChange) =>
      updateTimeToLive(dynamodb, table, change),
    updateStream: (table: string, change: StreamChange) => updateStream(dynamodb, table, change),
    searchItems: (table: string, input: ItemSearchInput, startKey?: Item) =>
      searchItems(dynamodb, table, input, startKey),
    getItem: (table: string, item: Item, keys: IndexKeys) => getItem(dynamodb, table, item, keys),
    putItem: (table: string, input: PutItemInput) => putItem(dynamodb, table, input),
    deleteItems: (table: string, keys: IndexKeys, items: readonly Item[]) =>
      deleteItems(dynamodb, table, keys, items),
    importItems: (
      table: string,
      keys: IndexKeys,
      items: readonly Item[],
      onProgress?: (done: number) => void,
    ) => importItems(dynamodb, table, keys, items, onProgress),
    scanAllItems: (table: string) => scanAllItems(dynamodb, table),
  };
}

export type DynamoDbService = ReturnType<typeof createDynamoDbService>;
