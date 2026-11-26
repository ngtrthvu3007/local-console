import { useQuery } from "@tanstack/react-query";
import { GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { LOG_REFRESH_INTERVAL_MS } from "@shared/logs/constants.ts";
import { logGroupExists, logStreamExists } from "@shared/logs/useLogEvents.ts";
import { useLogsClient } from "@shared/logs/useLogsClient.ts";
import { ECS_QUERY_ROOT } from "./useEcs.ts";

interface LogTarget {
  group: string;
  stream: string;
}

// Hỏi group và stream trước: thiếu thì GetLogEvents trả 400, trình duyệt ghi console.error
// ponytail: chỉ đọc trang đầu của GetLogEvents (tới 10 000 dòng), đủ cho một task chạy ở local
export function useTaskLogs(target: LogTarget | undefined, autoRefresh: boolean) {
  const logs = useLogsClient();

  return useQuery({
    queryKey: [ECS_QUERY_ROOT, "logs", target?.group, target?.stream],
    queryFn: async () => {
      if (!target || !(await logGroupExists(logs, target.group))) return [];

      if (!(await logStreamExists(logs, target.group, target.stream))) return [];

      const { events = [] } = await logs.send(
        new GetLogEventsCommand({
          logGroupName: target.group,
          logStreamName: target.stream,
          startFromHead: true,
        }),
      );
      return events;
    },
    enabled: Boolean(target),
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
  });
}
