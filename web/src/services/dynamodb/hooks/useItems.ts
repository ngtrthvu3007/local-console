import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  exportText,
  itemId,
  type IndexKeys,
  type Item,
  type ItemSearchInput,
  type PutItemInput,
} from "@localconsole/core/dynamodb";
import { downloadBlob } from "@shared/download.ts";
import { useDynamoDbService } from "./useDynamoDbService.ts";
import { tableQueryKey, useInvalidateTable } from "./useTables.ts";

// Mọi trang kết quả của bảng nằm dưới key này: sửa/xóa/import xong thì làm mới cả nhóm
const itemsQueryKey = (table: string) => tableQueryKey(table, "items");

export interface SearchRequest extends ItemSearchInput {
  runId: number; // bấm Run lại cùng điều kiện vẫn tải lại từ trang đầu
}

export function useItemPages(table: string, request?: SearchRequest) {
  const dynamodb = useDynamoDbService();

  return useInfiniteQuery({
    queryKey: [...itemsQueryKey(table), request?.runId, request?.search],
    enabled: Boolean(request),
    initialPageParam: undefined as Item | undefined,
    queryFn: ({ pageParam }) => dynamodb.searchItems(table, request!, pageParam),
    getNextPageParam: (page) => page.lastKey,
  });
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

export function usePutItem(table: string) {
  const dynamodb = useDynamoDbService();
  const invalidate = useInvalidateItems(table);

  return useMutation({
    mutationFn: (input: PutItemInput) => dynamodb.putItem(table, input),
    onSuccess: invalidate,
  });
}

export function useDeleteItems(table: string, keys: IndexKeys) {
  const dynamodb = useDynamoDbService();
  const invalidate = useInvalidateItems(table);

  return useMutation({
    mutationFn: (items: Item[]) => dynamodb.deleteItems(table, keys, items),
    onSuccess: invalidate,
  });
}

export function useImportItems(table: string, keys: IndexKeys, onProgress: (done: number) => void) {
  const dynamodb = useDynamoDbService();
  const invalidate = useInvalidateItems(table);

  return useMutation({
    mutationFn: (items: Item[]) => dynamodb.importItems(table, keys, items, onProgress),
    onSuccess: invalidate,
  });
}

// Dòng trong bảng có thể cũ hoặc chỉ có attribute của index, PutItem đè sẽ mất phần còn lại. gcTime 0: luôn đọc mới
export function useFullItem(table: string, item: Item | undefined, keys: IndexKeys) {
  const dynamodb = useDynamoDbService();

  return useQuery({
    queryKey: [...itemsQueryKey(table), "item", item ? itemId(item, keys) : undefined],
    enabled: Boolean(item),
    gcTime: 0,
    queryFn: () => dynamodb.getItem(table, item!, keys),
  });
}

const EXPORT_MIME_TYPE = "application/json";
const EXPORT_EXTENSION = ".json";

// DynamoDB JSON để không mất số lớn, Set, Binary
export function useExportTable(table: string) {
  const dynamodb = useDynamoDbService();

  return useMutation({
    mutationFn: async () => {
      const items = await dynamodb.scanAllItems(table);

      downloadBlob(`${table}${EXPORT_EXTENSION}`, exportText(items), EXPORT_MIME_TYPE);
      return items.length;
    },
  });
}
