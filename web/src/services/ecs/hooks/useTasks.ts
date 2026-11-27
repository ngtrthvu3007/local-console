import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  paginateListTasks,
  type ECSClient,
  type RunTaskCommandInput,
} from "@aws-sdk/client-ecs";
import { chunks } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { taskIdOf } from "../arns.ts";
import { runTaskOutcome } from "../tasks.ts";
import { DESCRIBE_BATCH, STATUS, STOP_REASON, type DesiredStatus } from "../constants.ts";
import { clusterKey, useEcs } from "./useEcs.ts";

// Task đang chạy thì tự hỏi lại: trạng thái đổi trong vài giây (pull image, chạy, dừng)
const ACTIVE_TASK_REFRESH_MS = 3_000;

const tasksKey = (cluster: string) => [...clusterKey(cluster), "tasks"];

interface TaskFilter {
  desiredStatus: DesiredStatus;
  serviceName?: string;
}

async function describeTasks(client: ECSClient, cluster: string, arns: string[]) {
  const batches = await Promise.all(
    chunks(arns, DESCRIBE_BATCH.tasks).map(
      async (batch) =>
        (await client.send(new DescribeTasksCommand({ cluster, tasks: batch }))).tasks,
    ),
  );
  return batches
    .flatMap((batch) => batch ?? [])
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// enabled: chỉ gọi khi cluster đã chắc có (ListTasks với cluster lạ trả 400, "default" thì bị tạo)
export function useTasks(cluster: string, filter: TaskFilter, enabled: boolean) {
  const client = useEcs();

  return useQuery({
    queryKey: [...tasksKey(cluster), filter.desiredStatus, filter.serviceName],
    queryFn: async () => {
      const arns: string[] = [];
      for await (const page of paginateListTasks({ client }, { cluster, ...filter })) {
        arns.push(...(page.taskArns ?? []));
      }
      return describeTasks(client, cluster, arns);
    },
    enabled,
  });
}

// null = task không có: Floci không lưu task qua restart (spec 7 #12)
export function useTask(cluster: string, taskId: string, enabled: boolean) {
  const client = useEcs();

  return useQuery({
    queryKey: [...tasksKey(cluster), "detail", taskId],
    queryFn: async () => (await describeTasks(client, cluster, [taskId]))[0] ?? null,
    refetchInterval: ({ state }) =>
      state.data && state.data.lastStatus !== STATUS.stopped ? ACTIVE_TASK_REFRESH_MS : false,
    enabled,
  });
}

export function useRunTask() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RunTaskCommandInput) =>
      runTaskOutcome(await client.send(new RunTaskCommand(input))),
    onSuccess: (_result, input) =>
      queryClient.invalidateQueries({ queryKey: clusterKey(input.cluster ?? "") }),
  });
}

export function useStopTasks(cluster: string) {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (arns: readonly string[]) =>
      runEach(arns, taskIdOf, (arn) =>
        client.send(new StopTaskCommand({ cluster, task: arn, reason: STOP_REASON })),
      ),
    // Cả danh sách task lẫn số đếm trên header cluster
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}
