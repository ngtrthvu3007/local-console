import {
  BatchWriteItemCommand,
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  paginateScan,
  type DynamoDBClient,
  type WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { collectPages } from "#shared/aws/pagination.ts";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import {
  BATCH_WRITE_MAX_ITEMS,
  ITEMS_PAGE_SIZE,
  UNPROCESSED_RETRY_LIMIT,
} from "#services/dynamodb/constants.ts";
import { buildSearchInput, type ItemSearch } from "#services/dynamodb/expressions.ts";
import { keyLabel, pickKey, type Item } from "#services/dynamodb/itemJson.ts";
import type { IndexKeys } from "#services/dynamodb/keys.ts";

export interface ItemPage {
  items: Item[];
  count: number;
  scannedCount: number;
  lastKey?: Item;
}

export interface ItemSearchInput {
  search: ItemSearch;
  keys: IndexKeys;
}

export interface PutItemInput {
  item: Item;
  createOnly: boolean; // tạo mới / nhân bản: không ghi đè item có sẵn
  partitionKeyName: string;
}

const DUPLICATE_KEY_MESSAGE = "An item with this key already exists.";

// Mỗi trang là một lần gọi API với Limit: đúng cách DynamoDB phân trang,
// nên khi có filter một trang có thể ít item hoặc trống mà vẫn còn trang sau
export async function searchItems(
  dynamodb: DynamoDBClient,
  table: string,
  { search, keys }: ItemSearchInput,
  startKey?: Item,
): Promise<ItemPage> {
  const input = {
    ...buildSearchInput(table, search, keys),
    Limit: ITEMS_PAGE_SIZE,
    ExclusiveStartKey: startKey,
  };

  const result =
    search.mode === "query"
      ? await dynamodb.send(new QueryCommand(input))
      : await dynamodb.send(new ScanCommand(input));

  return {
    items: result.Items ?? [],
    count: result.Count ?? 0,
    scannedCount: result.ScannedCount ?? 0,
    lastKey: result.LastEvaluatedKey,
  };
}

const requestItem = (request: WriteRequest): Item =>
  request.PutRequest?.Item ?? request.DeleteRequest?.Key ?? {};

// Gửi lại UnprocessedItems vài lần. Lỗi giữa chừng: chỉ phần còn chờ lúc đó tính là lỗi
async function writeUntilProcessed(
  dynamodb: DynamoDBClient,
  table: string,
  batch: WriteRequest[],
): Promise<{ pending: WriteRequest[]; error?: unknown }> {
  let pending = batch;

  try {
    for (let attempt = 0; pending.length && attempt <= UNPROCESSED_RETRY_LIMIT; attempt++) {
      const result = await dynamodb.send(
        new BatchWriteItemCommand({ RequestItems: { [table]: pending } }),
      );

      pending = result.UnprocessedItems?.[table] ?? [];
    }
  } catch (error) {
    return { pending, error };
  }

  return { pending };
}

// BatchWriteItem tối đa 25 yêu cầu; lỗi tính theo item để đếm đúng
async function batchWrite(
  dynamodb: DynamoDBClient,
  table: string,
  keys: IndexKeys,
  requests: WriteRequest[],
  onProgress?: (done: number) => void,
) {
  const failures: string[] = [];
  const failItems = (failed: WriteRequest[], reason: string) =>
    failures.push(...failed.map((request) => `${keyLabel(requestItem(request), keys)}: ${reason}`));
  let done = 0;

  for (let start = 0; start < requests.length; start += BATCH_WRITE_MAX_ITEMS) {
    const batch = requests.slice(start, start + BATCH_WRITE_MAX_ITEMS);
    const { pending, error } = await writeUntilProcessed(dynamodb, table, batch);

    failItems(pending, error ? errorMessage(error) : "not processed, try again");
    if (!error) done += batch.length - pending.length;

    onProgress?.(done);
  }

  return { count: done, failures };
}

export async function putItem(
  dynamodb: DynamoDBClient,
  table: string,
  { item, createOnly, partitionKeyName }: PutItemInput,
) {
  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: table,
        Item: item,
        ...(createOnly && {
          ConditionExpression: "attribute_not_exists(#partitionKey)",
          ExpressionAttributeNames: { "#partitionKey": partitionKeyName },
        }),
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) throw new Error(DUPLICATE_KEY_MESSAGE);
    throw error;
  }
}

export const deleteItems = (
  dynamodb: DynamoDBClient,
  table: string,
  keys: IndexKeys,
  items: readonly Item[],
) =>
  batchWrite(
    dynamodb,
    table,
    keys,
    items.map((item) => ({ DeleteRequest: { Key: pickKey(item, keys) } })),
  );

export const importItems = (
  dynamodb: DynamoDBClient,
  table: string,
  keys: IndexKeys,
  items: readonly Item[],
  onProgress?: (done: number) => void,
) =>
  batchWrite(
    dynamodb,
    table,
    keys,
    items.map((item) => ({ PutRequest: { Item: item } })),
    onProgress,
  );

// null: item đã bị xóa
export const getItem = async (
  dynamodb: DynamoDBClient,
  table: string,
  item: Item,
  keys: IndexKeys,
) =>
  (
    await dynamodb.send(
      new GetItemCommand({ TableName: table, Key: pickKey(item, keys), ConsistentRead: true }),
    )
  ).Item ?? null;

export const scanAllItems = (dynamodb: DynamoDBClient, table: string) =>
  collectPages(paginateScan({ client: dynamodb }, { TableName: table }), (page) => page.Items);
