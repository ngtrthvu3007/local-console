import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewApiKey } from "@localconsole/core/appsync";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSyncService } from "./useAppSyncService.ts";

const apiKeysQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "api-keys", apiId];

export function useApiKeys(apiId: string) {
  const appsync = useAppSyncService();

  return useQuery({ queryKey: apiKeysQueryKey(apiId), queryFn: () => appsync.listApiKeys(apiId) });
}

export function useCreateApiKey(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: NewApiKey) => appsync.createApiKey(apiId, key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(apiId) }),
  });
}

export function useDeleteApiKey(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => appsync.deleteApiKey(apiId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(apiId) }),
  });
}
