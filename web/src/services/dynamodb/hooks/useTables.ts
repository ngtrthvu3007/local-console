import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  paginateListTables,
  type KeySchemaElement,
  type TableDescription,
} from "@aws-sdk/client-dynamodb";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  BILLING_MODE_ON_DEMAND,
  KEY_TYPE_HASH,
  KEY_TYPE_RANGE,
  PROJECTION_ALL,
  type KeyType,
} from "../constants.ts";
import { useDynamoDB } from "./useDynamoDB.ts";

const tablesQueryKey = ["dynamodb", "tables"];
// Mọi query về một bảng (chi tiết, item, TTL, stream…) nằm dưới key này
export const tableQueryKey = (table: string, part: string) => ["dynamodb", "table", table, part];
const DETAILS = "details";

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

export function useTables() {
  const client = useDynamoDB();
  return useQuery({
    queryKey: tablesQueryKey,
    queryFn: async () => {
      const names: string[] = [];
      for await (const page of paginateListTables({ client }, {})) {
        names.push(...(page.TableNames ?? []));
      }
      // Local ít bảng nên đọc chi tiết từng bảng song song
      const tables = await Promise.all(
        names.map(
          async (name) => (await client.send(new DescribeTableCommand({ TableName: name }))).Table!,
        ),
      );
      return tables;
    },
  });
}

export function useTable(table: string) {
  const client = useDynamoDB();
  return useQuery({
    queryKey: tableQueryKey(table, DETAILS),
    queryFn: async () => (await client.send(new DescribeTableCommand({ TableName: table }))).Table!,
    retry: false,
  });
}

// Làm mới chi tiết và danh sách; trả promise để nút giữ loading tới khi dữ liệu mới về
export function useInvalidateTable() {
  const queryClient = useQueryClient();
  return (table: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tableQueryKey(table, DETAILS) }),
      queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
    ]);
}

export interface CreateTableInput {
  name: string;
  keys: IndexKeys;
  indexes: { name: string; keys: IndexKeys }[];
}

const keySchemaElements = ({ partitionKey, sortKey }: IndexKeys): KeySchemaElement[] => [
  { AttributeName: partitionKey.name, KeyType: KEY_TYPE_HASH },
  ...(sortKey ? [{ AttributeName: sortKey.name, KeyType: KEY_TYPE_RANGE }] : []),
];

export function useCreateTable() {
  const client = useDynamoDB();
  const invalidate = useInvalidateTable();
  return useMutation({
    mutationFn: ({ name, keys, indexes }: CreateTableInput) => {
      // Mỗi attribute dùng làm key chỉ khai báo một lần, dù xuất hiện ở bảng và nhiều index
      const attributes = new Map<string, KeyType>();
      for (const { partitionKey, sortKey } of [keys, ...indexes.map((index) => index.keys)]) {
        attributes.set(partitionKey.name, partitionKey.type);
        if (sortKey) attributes.set(sortKey.name, sortKey.type);
      }
      return client.send(
        new CreateTableCommand({
          TableName: name,
          BillingMode: BILLING_MODE_ON_DEMAND,
          AttributeDefinitions: [...attributes].map(([attributeName, type]) => ({
            AttributeName: attributeName,
            AttributeType: type,
          })),
          KeySchema: keySchemaElements(keys),
          GlobalSecondaryIndexes: indexes.length
            ? indexes.map((index) => ({
                IndexName: index.name,
                KeySchema: keySchemaElements(index.keys),
                Projection: { ProjectionType: PROJECTION_ALL },
              }))
            : undefined,
        }),
      );
    },
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteTables() {
  const client = useDynamoDB();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tables: string[]) => {
      const failures: string[] = [];
      for (const table of tables) {
        try {
          await client.send(new DeleteTableCommand({ TableName: table }));
        } catch (error) {
          failures.push(`${table}: ${errorMessage(error)}`);
        }
      }
      return { count: tables.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
  });
}
