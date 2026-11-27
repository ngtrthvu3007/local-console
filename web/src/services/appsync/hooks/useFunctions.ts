import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveFunctionInput } from "@localconsole/core/appsync";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSyncService } from "./useAppSyncService.ts";

export const functionsQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "functions", apiId];

export function useApiFunctions(apiId: string) {
  const appsync = useAppSyncService();

  return useQuery({
    queryKey: functionsQueryKey(apiId),
    queryFn: () => appsync.listFunctions(apiId),
  });
}

export function useSaveFunction(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveFunctionInput) => appsync.saveFunction(apiId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey(apiId) }),
  });
}

export function useDeleteFunction(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (functionId: string) => appsync.deleteFunction(apiId, functionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey(apiId) }),
  });
}
