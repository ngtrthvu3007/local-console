import { useQuery } from "@tanstack/react-query";
import {
  DescribeLogGroupsCommand,
  paginateFilterLogEvents,
  type CloudWatchLogsClient,
  type FilteredLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import { LOG_RANGES, LOG_REFRESH_INTERVAL_MS, type LogRangeId } from "../constants.ts";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambda } from "./useLambda.ts";

// Function chưa chạy lần nào thì chưa có log group. Hỏi trước bằng DescribeLogGroups (trả 200, rỗng)
// thay vì để FilterLogEvents trả 400: request lỗi làm trình duyệt ghi console.error mỗi lần mở tab
export async function logGroupExists(logs: CloudWatchLogsClient, logGroupName: string) {
  const { logGroups = [] } = await logs.send(
    new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }),
  );
  // Lọc theo tiền tố: /aws/lambda/demo cũng khớp /aws/lambda/demo-consumer
  return logGroups.some((group) => group.logGroupName === logGroupName);
}

interface LogOptions {
  rangeId: LogRangeId;
  filterPattern: string; // cú pháp filter pattern của CloudWatch Logs, vd: ERROR
  autoRefresh: boolean;
}

// Gộp log của cả log group vào một danh sách, mới nhất ở trên.
// API trả từ cũ tới mới theo trang, nên phải tải hết khoảng thời gian rồi mới đảo được.
// ponytail: tải hết log trong khoảng (local ít log); log quá nhiều thì đổi sang đọc ngược từng log stream
export function useFunctionLogs(name: string, logGroupName: string, options: LogOptions) {
  const { logs } = useLambda();
  const { rangeId, filterPattern, autoRefresh } = options;
  const range = LOG_RANGES.find((candidate) => candidate.id === rangeId)!;
  return useQuery({
    queryKey: [...functionQueryKey(name, "logs"), rangeId, filterPattern],
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
