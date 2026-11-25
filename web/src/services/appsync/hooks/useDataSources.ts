import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateDataSourceCommand,
  DeleteDataSourceCommand,
  UpdateDataSourceCommand,
  paginateListDataSources,
  type CreateDataSourceRequest,
  type DataSource,
} from "@aws-sdk/client-appsync";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { DATA_SOURCE_TYPES } from "../constants.ts";
import type { DataSourceForm } from "../schemas.ts";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSync } from "./useAppSync.ts";

const dataSourcesQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "data-sources", apiId];

export function useDataSources(apiId: string) {
  const client = useAppSync();

  return useQuery({
    queryKey: dataSourcesQueryKey(apiId),
    queryFn: async () => {
      const dataSources: DataSource[] = [];
      for await (const page of paginateListDataSources({ client }, { apiId })) {
        dataSources.push(...(page.dataSources ?? []));
      }
      return dataSources;
    },
  });
}

// Không gửi serviceRoleArn: Floci không cần role để gọi bảng / function (spec 7 #15)
export function useSaveDataSource(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();
  const { region } = useLoadedConfig();

  return useMutation({
    mutationFn: ({ editing, ...form }: DataSourceForm & { editing: boolean }) => {
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
          form.type === DATA_SOURCE_TYPES.lambda
            ? { lambdaFunctionArn: form.functionArn }
            : undefined,
      };
      return client.send(
        editing ? new UpdateDataSourceCommand(input) : new CreateDataSourceCommand(input),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey(apiId) }),
  });
}

export function useDeleteDataSource(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => client.send(new DeleteDataSourceCommand({ apiId, name })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey(apiId) }),
  });
}
