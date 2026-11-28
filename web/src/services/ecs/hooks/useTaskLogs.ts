import { useQuery } from "@tanstack/react-query";
import type { LogTarget } from "@localconsole/core/ecs";
import { LOG_REFRESH_INTERVAL_MS } from "@shared/logs/constants.ts";
import { ECS_QUERY_ROOT, useEcsService } from "./useEcsService.ts";

export function useTaskLogs(target: LogTarget | undefined, autoRefresh: boolean) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [ECS_QUERY_ROOT, "logs", target?.group, target?.stream],
    queryFn: () => ecs.getTaskLogs(target!),
    enabled: Boolean(target),
    refetchInterval: autoRefresh ? LOG_REFRESH_INTERVAL_MS : false,
  });
}
