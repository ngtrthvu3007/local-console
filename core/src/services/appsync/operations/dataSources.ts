import {
  CreateDataSourceCommand,
  DeleteDataSourceCommand,
  UpdateDataSourceCommand,
  paginateListDataSources,
  type AppSyncClient,
  type CreateDataSourceRequest,
} from "@aws-sdk/client-appsync";
import { collectPages } from "#shared/aws/pagination.ts";
import { DATA_SOURCE_TYPES } from "#services/appsync/constants.ts";
import type { DataSourceForm } from "#services/appsync/schemas.ts";

export type SaveDataSourceInput = DataSourceForm & { editing: boolean };

export const listDataSources = (appsync: AppSyncClient, apiId: string) =>
  collectPages(paginateListDataSources({ client: appsync }, { apiId }), (page) => page.dataSources);

// Không gửi serviceRoleArn: Floci không cần role để gọi bảng / function (spec 7 #15)
export function saveDataSource(
  appsync: AppSyncClient,
  region: string,
  apiId: string,
  { editing, ...form }: SaveDataSourceInput,
) {
  const input: CreateDataSourceRequest = {
    apiId,
    name: form.name.trim(),
    type: form.type,
    description: form.description || undefined,
    dynamodbConfig:
      form.type === DATA_SOURCE_TYPES.dynamodb
        ? { tableName: form.tableName, awsRegion: region }
        : undefined,
    lambdaConfig:
      form.type === DATA_SOURCE_TYPES.lambda ? { lambdaFunctionArn: form.functionArn } : undefined,
  };
  return appsync.send(
    editing ? new UpdateDataSourceCommand(input) : new CreateDataSourceCommand(input),
  );
}

export const deleteDataSource = (appsync: AppSyncClient, apiId: string, name: string) =>
  appsync.send(new DeleteDataSourceCommand({ apiId, name }));
