import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LOGS_KEYS, LOGS_QUERY_ROOT, LOG_REFRESH_INTERVAL_MS } from "@shared/logs/constants.ts";
import { useLogsService } from "@shared/logs/useLogsService.ts";

export function useLogStreams(group: string) {
  const logs = useLogsService();

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.streams, group],
    queryFn: () => logs.listLogStreams(group),
  });
}

export function useStreamEvents(
  group: string,
  stream: string,
  groupExists: boolean | undefined,
  autoRefresh: boolean,
) {
  const logs = useLogsService();

  const query = useInfiniteQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.stream, group, stream],
    enabled: groupExists === true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => logs.getStreamEventsPage({ group, stream, token: pageParam }),
    getNextPageParam: (last) =>
      last.events.length && last.backwardToken && last.backwardToken !== last.requestToken
        ? last.backwardToken
        : undefined,
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
  });

  const pages = query.data?.pages;
  const data =
    groupExists === false || pages?.[0]?.missing
      ? null
      : pages?.flatMap((page) => [...page.events].reverse());

  return {
    ...query,
    isLoading: groupExists === undefined || query.isLoading,
    data,
    loadOlder: () => query.fetchNextPage(),
    hasOlder: query.hasNextPage,
  };
}

export function useSendTestEvent(group: string) {
  const logs = useLogsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { stream: string; message: string }) =>
      logs.sendTestEvent({ ...input, group }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LOGS_QUERY_ROOT] }),
  });
}
