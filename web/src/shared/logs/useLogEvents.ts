import { useQuery } from "@tanstack/react-query";
import type { LogRangeId } from "@localconsole/core/logs";
import { LOG_REFRESH_INTERVAL_MS, LOGS_KEYS, LOGS_QUERY_ROOT } from "./constants.ts";
import { useLogsService } from "./useLogsService.ts";

interface LogEventsOptions {
  rangeId: LogRangeId;
  filterPattern: string; // cú pháp filter pattern của CloudWatch Logs, vd: ERROR
  autoRefresh: boolean;
}

export function useLogEvents(logGroupName: string, options: LogEventsOptions) {
  const logs = useLogsService();
  const { rangeId, filterPattern, autoRefresh } = options;

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.events, logGroupName, rangeId, filterPattern],
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
    queryFn: () => logs.listLogEvents({ logGroupName, rangeId, filterPattern }),
  });
}
