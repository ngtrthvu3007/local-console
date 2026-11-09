import { useQuery } from "@tanstack/react-query";
import { paginateFilterLogEvents, type FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import { LOG_RANGES, LOG_REFRESH_INTERVAL_MS, type LogRangeId } from "../constants.ts";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambda } from "./useLambda.ts";

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
    queryFn: () =>
      // Function chưa chạy lần nào thì chưa có log group
      orEmptyWhenNotFound(async () => {
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
      }, []),
  });
}
