import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunTaskCommandInput } from "@aws-sdk/client-ecs";
import { STATUS, type TaskFilter } from "@localconsole/core/ecs";
import { clusterKey, useEcsService } from "./useEcsService.ts";

// Task đang chạy thì tự hỏi lại: trạng thái đổi trong vài giây (pull image, chạy, dừng)
const ACTIVE_TASK_REFRESH_MS = 3_000;

const tasksKey = (cluster: string) => [...clusterKey(cluster), "tasks"];

export function useTasks(cluster: string, filter: TaskFilter, enabled: boolean) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [...tasksKey(cluster), filter.desiredStatus, filter.serviceName],
    queryFn: () => ecs.listTasks(cluster, filter),
    enabled,
  });
}

export function useTask(cluster: string, taskId: string, enabled: boolean) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [...tasksKey(cluster), "detail", taskId],
    queryFn: () => ecs.getTask(cluster, taskId),
    refetchInterval: ({ state }) =>
      state.data && state.data.lastStatus !== STATUS.stopped ? ACTIVE_TASK_REFRESH_MS : false,
    enabled,
  });
}

export function useRunTask() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.runTask,
    onSuccess: (_result, input: RunTaskCommandInput) =>
      queryClient.invalidateQueries({ queryKey: clusterKey(input.cluster ?? "") }),
  });
}

export function useStopTasks(cluster: string) {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (arns: readonly string[]) => ecs.stopTasks(cluster, arns),
    // Cả danh sách task lẫn số đếm trên header cluster
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}
