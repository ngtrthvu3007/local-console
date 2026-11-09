import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { BATCH_WRITE_MAX_ITEMS, ITEMS_PAGE_SIZE, UNPROCESSED_RETRY_LIMIT } from "../constants.ts";
import { buildSearchInput, type ItemSearch } from "../expressions.ts";
import { exportText, itemId, keyLabel, pickKey, type Item } from "../itemJson.ts";
import { useDynamoDB } from "./useDynamoDB.ts";
import { tableQueryKey, useInvalidateTable, type IndexKeys } from "./useTables.ts";

// Mọi trang kết quả của bảng nằm dưới key này: sửa/xóa/import xong thì làm mới cả nhóm
export const itemsQueryKey = (table: string) => tableQueryKey(table, "items");

export interface ItemPage {
  items: Item[];
  count: number;
  scannedCount: number;
  lastKey?: Item;
}

export interface SearchRequest {
  search: ItemSearch;
  keys: IndexKeys;
  runId: number; // bấm Run lại cùng điều kiện vẫn tải lại từ trang đầu
}

// Mỗi trang là một lần gọi API với Limit: đúng cách DynamoDB phân trang,
// nên khi có filter một trang có thể ít item hoặc trống mà vẫn còn trang sau
export function useItemPages(table: string, request?: SearchRequest) {
  const client = useDynamoDB();
  return useInfiniteQuery({
    queryKey: [...itemsQueryKey(table), request?.runId, request?.search],
    enabled: Boolean(request),
    initialPageParam: undefined as Item | undefined,
    queryFn: async ({ pageParam }): Promise<ItemPage> => {
      const { search, keys } = request!;
      const input = {
        ...buildSearchInput(table, search, keys),
        Limit: ITEMS_PAGE_SIZE,
        ExclusiveStartKey: pageParam,
      };
      const result =
        search.mode === "query"
          ? await client.send(new QueryCommand(input))
          : await client.send(new ScanCommand(input));
      return {
        items: result.Items ?? [],
        count: result.Count ?? 0,
        scannedCount: result.ScannedCount ?? 0,
        lastKey: result.LastEvaluatedKey,
      };
    },
    getNextPageParam: (page) => page.lastKey,
  });
}

export interface BulkResult {
  count: number;
  failures: string[];
}

// Item (hoặc key) trong một yêu cầu ghi hàng loạt
const requestItem = (request: WriteRequest): Item =>
  request.PutRequest?.Item ?? request.DeleteRequest?.Key ?? {};

// BatchWriteItem nhận tối đa 25 yêu cầu; item DynamoDB chưa xử lý kịp (UnprocessedItems) thì gửi lại.
// Lỗi ghi theo từng item (kèm key) để số lỗi đúng là số item không ghi được
async function batchWrite(
  client: DynamoDBClient,
  table: string,
  keys: IndexKeys,
  requests: WriteRequest[],
  onProgress?: (done: number) => void,
): Promise<BulkResult> {
  const failures: string[] = [];
  const failItems = (failed: WriteRequest[], reason: string) =>
    failures.push(...failed.map((request) => `${keyLabel(requestItem(request), keys)}: ${reason}`));
  let done = 0;
  for (let start = 0; start < requests.length; start += BATCH_WRITE_MAX_ITEMS) {
    let pending = requests.slice(start, start + BATCH_WRITE_MAX_ITEMS);
    const batchSize = pending.length;
    try {
      for (let attempt = 0; pending.length && attempt <= UNPROCESSED_RETRY_LIMIT; attempt++) {
        const result = await client.send(
          new BatchWriteItemCommand({ RequestItems: { [table]: pending } }),
        );
        pending = result.UnprocessedItems?.[table] ?? [];
      }
      failItems(pending, "not processed, try again");
      done += batchSize - pending.length;
    } catch (error) {
      failItems(pending, errorMessage(error));
    }
    onProgress?.(done);
  }
  return { count: done, failures };
}

// Ghi xong thì làm mới kết quả tìm, chi tiết bảng và danh sách bảng (số item)
function useInvalidateItems(table: string) {
  const queryClient = useQueryClient();
  const invalidateTable = useInvalidateTable();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: itemsQueryKey(table) }),
      invalidateTable(table),
    ]);
}

const DUPLICATE_KEY_MESSAGE = "An item with this key already exists.";

interface PutItemInput {
  item: Item;
  createOnly: boolean; // tạo mới / nhân bản: không ghi đè item có sẵn
  partitionKeyName: string;
}

export function usePutItem(table: string) {
  const client = useDynamoDB();
  const invalidate = useInvalidateItems(table);
  return useMutation({
    mutationFn: async ({ item, createOnly, partitionKeyName }: PutItemInput) => {
      try {
        await client.send(
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
        if (error instanceof ConditionalCheckFailedException)
          throw new Error(DUPLICATE_KEY_MESSAGE);
        throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteItems(table: string, keys: IndexKeys) {
  const client = useDynamoDB();
  const invalidate = useInvalidateItems(table);
  return useMutation({
    mutationFn: (items: Item[]) =>
      batchWrite(
        client,
        table,
        keys,
        items.map((item) => ({ DeleteRequest: { Key: pickKey(item, keys) } })),
      ),
    onSuccess: invalidate,
  });
}

export function useImportItems(table: string, keys: IndexKeys, onProgress: (done: number) => void) {
  const client = useDynamoDB();
  const invalidate = useInvalidateItems(table);
  return useMutation({
    mutationFn: (items: Item[]) =>
      batchWrite(
        client,
        table,
        keys,
        items.map((item) => ({ PutRequest: { Item: item } })),
        onProgress,
      ),
    onSuccess: invalidate,
  });
}

// Đọc lại cả item trước khi sửa: dòng trong bảng có thể là bản cũ, hoặc chỉ là phần
// index trả về (index KEYS_ONLY / INCLUDE), lưu đè bằng PutItem sẽ làm mất attribute khác.
// gcTime 0: mỗi lần mở editor đọc mới, không dùng bản trong cache
export function useFullItem(table: string, item: Item | undefined, keys: IndexKeys) {
  const client = useDynamoDB();
  return useQuery({
    queryKey: [...itemsQueryKey(table), "item", item ? itemId(item, keys) : undefined],
    enabled: Boolean(item),
    gcTime: 0,
    queryFn: async () => {
      const result = await client.send(
        new GetItemCommand({ TableName: table, Key: pickKey(item!, keys), ConsistentRead: true }),
      );
      return result.Item ?? null; // null: item đã bị xóa
    },
  });
}

const EXPORT_MIME_TYPE = "application/json";
const EXPORT_EXTENSION = ".json";

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: EXPORT_MIME_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Export cả bảng (mọi trang), ra DynamoDB JSON để không mất số lớn, Set, Binary
export function useExportTable(table: string) {
  const client = useDynamoDB();
  return useMutation({
    mutationFn: async () => {
      const items: Item[] = [];
      for await (const page of paginateScan({ client }, { TableName: table })) {
        items.push(...(page.Items ?? []));
      }
      downloadText(`${table}${EXPORT_EXTENSION}`, exportText(items));
      return items.length;
    },
  });
}
