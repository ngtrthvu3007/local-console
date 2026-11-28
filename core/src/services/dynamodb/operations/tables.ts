import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  paginateListTables,
  type DynamoDBClient,
  type KeySchemaElement,
} from "@aws-sdk/client-dynamodb";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import {
  BILLING_MODE_ON_DEMAND,
  KEY_TYPE_HASH,
  KEY_TYPE_RANGE,
  PROJECTION_ALL,
  SSE_TYPE_KMS,
  TABLE_ENCRYPTION,
  type TableEncryption,
} from "#services/dynamodb/constants.ts";
import { keyAttributesOf, type IndexKeys } from "#services/dynamodb/keys.ts";

export interface CreateTableInput {
  name: string;
  keys: IndexKeys;
  indexes: { name: string; keys: IndexKeys }[];
  encryption: TableEncryption;
  kmsKeyId: string;
}

export const getTable = async (dynamodb: DynamoDBClient, table: string) =>
  (await dynamodb.send(new DescribeTableCommand({ TableName: table }))).Table!;

export async function listTables(dynamodb: DynamoDBClient) {
  const names = await collectPages(
    paginateListTables({ client: dynamodb }, {}),
    (page) => page.TableNames,
  );

  // Local ít bảng nên đọc chi tiết từng bảng song song
  return Promise.all(names.map((name) => getTable(dynamodb, name)));
}

const keySchemaElements = ({ partitionKey, sortKey }: IndexKeys): KeySchemaElement[] => [
  { AttributeName: partitionKey.name, KeyType: KEY_TYPE_HASH },
  ...(sortKey ? [{ AttributeName: sortKey.name, KeyType: KEY_TYPE_RANGE }] : []),
];

export function createTable(
  dynamodb: DynamoDBClient,
  { name, keys, indexes, encryption, kmsKeyId }: CreateTableInput,
) {
  // Mỗi attribute dùng làm key chỉ khai báo một lần, dù xuất hiện ở bảng và nhiều index
  const attributes = new Map(
    [keys, ...indexes.map((index) => index.keys)]
      .flatMap(keyAttributesOf)
      .map((key) => [key.name, key.type]),
  );

  return dynamodb.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: BILLING_MODE_ON_DEMAND,
      // Key AWS sở hữu là mặc định: không gửi SSESpecification
      SSESpecification:
        encryption === TABLE_ENCRYPTION.awsOwned
          ? undefined
          : { Enabled: true, SSEType: SSE_TYPE_KMS, KMSMasterKeyId: kmsKeyId || undefined },
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
}

export const deleteTables = (dynamodb: DynamoDBClient, tables: readonly string[]) =>
  runEach(
    tables,
    (table) => table,
    (table) => dynamodb.send(new DeleteTableCommand({ TableName: table })),
  );
