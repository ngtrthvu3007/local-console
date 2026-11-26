import { useQuery } from "@tanstack/react-query";
import {
  DescribeLogStreamsCommand,
  paginateDescribeLogGroups,
  paginateFilterLogEvents,
  type CloudWatchLogsClient,
  type FilteredLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  LOG_RANGES,
  LOG_REFRESH_INTERVAL_MS,
  LOGS_KEYS,
  LOGS_QUERY_ROOT,
  type LogRangeId,
} from "./constants.ts";
import { useLogsClient } from "./useLogsClient.ts";

// Hỏi trước khi đọc: gọi theo tên một group / stream chưa có thì Floci trả 400, trình duyệt ghi
// console.error. Lọc theo tiền tố rồi so đúng tên: /aws/lambda/demo cũng khớp /aws/lambda/demo-consumer
export async function findLogGroup(client: CloudWatchLogsClient, name: string) {
  for await (const page of paginateDescribeLogGroups({ client }, { logGroupNamePrefix: name })) {
    const found = page.logGroups?.find((group) => group.logGroupName === name);
    if (found) return found;
  }
  return undefined;
}

export const logGroupExists = async (client: CloudWatchLogsClient, name: string) =>
  Boolean(await findLogGroup(client, name));

// Group phải có trước: hỏi stream của group không có cũng trả 400
export async function logStreamExists(client: CloudWatchLogsClient, group: string, stream: string) {
  const { logStreams = [] } = await client.send(
    new DescribeLogStreamsCommand({ logGroupName: group, logStreamNamePrefix: stream }),
  );
  return logStreams.some((item) => item.logStreamName === stream);
}

interface LogEventsOptions {
  rangeId: LogRangeId;
  filterPattern: string; // cú pháp filter pattern của CloudWatch Logs, vd: ERROR
  autoRefresh: boolean;
}

// API trả cũ → mới theo trang nên phải tải hết khoảng thời gian rồi mới đảo được
// ponytail: tải hết log trong khoảng (local ít log); log quá nhiều thì đọc ngược từng log stream
export function useLogEvents(logGroupName: string, options: LogEventsOptions) {
  const logs = useLogsClient();
  const { rangeId, filterPattern, autoRefresh } = options;
  const range = LOG_RANGES.find((candidate) => candidate.id === rangeId)!;

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.events, logGroupName, rangeId, filterPattern],
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
    queryFn: async () => {
      if (!(await logGroupExists(logs, logGroupName))) return [];
      const events: FilteredLogEvent[] = [];

      const paginator = paginateFilterLogEvents(
        { client: logs },
        {
          logGroupName,
          startTime: Date.now() - range.milliseconds,
          filterPattern: filterPattern || undefined,
        },
      );

      for await (const page of paginator) events.push(...(page.events ?? []));
      return events.reverse();
    },
  });
}
