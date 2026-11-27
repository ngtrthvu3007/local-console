import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResolverField, SaveResolverInput } from "@localconsole/core/appsync";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSyncService } from "./useAppSyncService.ts";

export const resolversQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "resolvers", apiId];

export function useResolvers(apiId: string, typeNames: readonly string[]) {
  const appsync = useAppSyncService();

  return useQuery({
    queryKey: [...resolversQueryKey(apiId), ...typeNames],
    enabled: typeNames.length > 0,
    queryFn: () => appsync.listResolvers(apiId, typeNames),
  });
}

export function useDeleteResolver(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (field: ResolverField) => appsync.deleteResolver(apiId, field),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resolversQueryKey(apiId) }),
  });
}

export function useSaveResolver(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveResolverInput) => appsync.saveResolver(apiId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resolversQueryKey(apiId) }),
  });
}
