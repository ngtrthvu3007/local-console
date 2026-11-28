import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateLogStreamCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
  paginateDescribeLogStreams,
  type LogStream,
  type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import { LOGS_KEYS, LOGS_QUERY_ROOT, LOG_REFRESH_INTERVAL_MS } from "@shared/logs/constants.ts";
import { logGroupExists, logStreamExists } from "@shared/logs/useLogEvents.ts";
import { useLogsClient } from "@shared/logs/useLogsClient.ts";

// Stream có event mới nhất lên đầu, giống AWS
export function useLogStreams(group: string) {
  const client = useLogsClient();

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.streams, group],
    queryFn: async () => {
      // Group bị xóa (ở đây hoặc nơi khác) thì Describe trả 400: kiểm trước, như useLogEvents
      if (!(await logGroupExists(client, group))) return [];
      const streams: LogStream[] = [];

      for await (const page of paginateDescribeLogStreams(
        { client },
        { logGroupName: group, orderBy: "LastEventTime", descending: true },
      ))
        streams.push(...(page.logStreams ?? []));
      return streams;
    },
  });
}

interface EventsPage {
  missing?: boolean;
  events: OutputLogEvent[]; // cũ → mới, như API trả
  requestToken?: string;
  backwardToken?: string;
}

// Trang đầu là cuối stream (giống AWS); Load older đi lùi theo nextBackwardToken.
// Hết event cũ thì Floci trả lại đúng token vừa gửi
export function useStreamEvents(
  group: string,
  stream: string,
  groupExists: boolean | undefined,
  autoRefresh: boolean,
) {
  const client = useLogsClient();

  const query = useInfiniteQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.stream, group, stream],
    enabled: groupExists === true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<EventsPage> => {
      if (!pageParam && !(await logStreamExists(client, group, stream)))
        return { missing: true, events: [] };

      const { events = [], nextBackwardToken } = await client.send(
        new GetLogEventsCommand({
          logGroupName: group,
          logStreamName: stream,
          startFromHead: false,
          nextToken: pageParam,
        }),
      );
      return { events, requestToken: pageParam, backwardToken: nextBackwardToken };
    },
    getNextPageParam: (last) =>
      last.events.length && last.backwardToken && last.backwardToken !== last.requestToken
        ? last.backwardToken
        : undefined,
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
  });

  const pages = query.data?.pages;
  // null = stream (hoặc group) không có
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
  const client = useLogsClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ stream, message }: { stream: string; message: string }) => {
      if (!(await logStreamExists(client, group, stream)))
        await client.send(
          new CreateLogStreamCommand({ logGroupName: group, logStreamName: stream }),
        );
      await client.send(
        new PutLogEventsCommand({
          logGroupName: group,
          logStreamName: stream,
          logEvents: [{ timestamp: Date.now(), message }],
        }),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LOGS_QUERY_ROOT] }),
  });
}
