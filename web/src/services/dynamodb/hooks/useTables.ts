import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTableInput } from "@localconsole/core/dynamodb";
import { existsQuery } from "@shared/aws.ts";
import { useDynamoDbService } from "./useDynamoDbService.ts";

const tablesQueryKey = ["dynamodb", "tables"];
// Mọi query về một bảng (chi tiết, item, TTL, stream…) nằm dưới key này
export const tableQueryKey = (table: string, part: string) => ["dynamodb", "table", table, part];
const DETAILS = "details";

export function useTableExists(name: string) {
  const dynamodb = useDynamoDbService();

  return useQuery(existsQuery(tableQueryKey(name, "exists"), () => dynamodb.getTable(name)));
}

export function useTables() {
  const dynamodb = useDynamoDbService();

  return useQuery({ queryKey: tablesQueryKey, queryFn: dynamodb.listTables });
}

export function useTable(table: string) {
  const dynamodb = useDynamoDbService();

  return useQuery({
    queryKey: tableQueryKey(table, DETAILS),
    queryFn: () => dynamodb.getTable(table),
    retry: false,
  });
}

// Trả promise để nút giữ loading tới khi dữ liệu mới về
export function useInvalidateTable() {
  const queryClient = useQueryClient();

  return (table: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tableQueryKey(table, DETAILS) }),
      queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
    ]);
}

export function useCreateTable() {
  const dynamodb = useDynamoDbService();
  const invalidate = useInvalidateTable();

  return useMutation({
    mutationFn: (input: CreateTableInput) => dynamodb.createTable(input),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteTables() {
  const dynamodb = useDynamoDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dynamodb.deleteTables,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
  });
}
