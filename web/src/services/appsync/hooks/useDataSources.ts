import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveDataSourceInput } from "@localconsole/core/appsync";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSyncService } from "./useAppSyncService.ts";

const dataSourcesQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "data-sources", apiId];

export function useDataSources(apiId: string) {
  const appsync = useAppSyncService();

  return useQuery({
    queryKey: dataSourcesQueryKey(apiId),
    queryFn: () => appsync.listDataSources(apiId),
  });
}

export function useSaveDataSource(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveDataSourceInput) => appsync.saveDataSource(apiId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey(apiId) }),
  });
}

export function useDeleteDataSource(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => appsync.deleteDataSource(apiId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey(apiId) }),
  });
}
