import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewSubscriptionFilter } from "@localconsole/core/logs";
import { LOGS_KEYS, LOGS_QUERY_ROOT } from "@shared/logs/constants.ts";
import { useLogsService } from "@shared/logs/useLogsService.ts";

const filtersKey = (group: string) => [LOGS_QUERY_ROOT, LOGS_KEYS.subscriptions, group];

export function useSubscriptionFilters(group: string) {
  const logs = useLogsService();

  return useQuery({
    queryKey: filtersKey(group),
    queryFn: () => logs.listSubscriptionFilters(group),
  });
}

export function usePutSubscriptionFilter(group: string) {
  const logs = useLogsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filter: NewSubscriptionFilter) => logs.putSubscriptionFilter(group, filter),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filtersKey(group) }),
  });
}

export function useDeleteSubscriptionFilters(group: string) {
  const logs = useLogsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) => logs.deleteSubscriptionFilters(group, names),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filtersKey(group) }),
  });
}
