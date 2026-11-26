import { useQuery } from "@tanstack/react-query";
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { useAwsClient } from "@shared/aws.ts";
import { LOG_REFRESH_INTERVAL_MS } from "../../lambda/constants.ts";
import { logGroupExists } from "../../lambda/hooks/useFunctionLogs.ts";
import { ECS_QUERY_ROOT } from "./useEcs.ts";

interface LogTarget {
  group: string;
  stream: string;
}

// Hỏi group và stream trước: thiếu thì GetLogEvents trả 400, trình duyệt ghi console.error
// ponytail: chỉ đọc trang đầu của GetLogEvents (tới 10 000 dòng), đủ cho một task chạy ở local
export function useTaskLogs(target: LogTarget | undefined, autoRefresh: boolean) {
  const logs = useAwsClient(CloudWatchLogsClient);

  return useQuery({
    queryKey: [ECS_QUERY_ROOT, "logs", target?.group, target?.stream],
    queryFn: async () => {
      if (!target || !(await logGroupExists(logs, target.group))) return [];

      const { logStreams = [] } = await logs.send(
        new DescribeLogStreamsCommand({
          logGroupName: target.group,
          logStreamNamePrefix: target.stream,
        }),
      );
      if (!logStreams.some((stream) => stream.logStreamName === target.stream)) return [];

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
