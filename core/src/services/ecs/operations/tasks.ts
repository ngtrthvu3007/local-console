import {
  DescribeTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  paginateListTasks,
  type ECSClient,
  type RunTaskCommandInput,
} from "@aws-sdk/client-ecs";
import { chunks, collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import type { LogsService } from "#services/logs/service.ts";
import { taskIdOf } from "#services/ecs/arns.ts";
import { DESCRIBE_BATCH, STOP_REASON, type DesiredStatus } from "#services/ecs/constants.ts";
import { runTaskOutcome } from "#services/ecs/tasks.ts";

export interface TaskFilter {
  desiredStatus: DesiredStatus;
  serviceName?: string;
}

export interface LogTarget {
  group: string;
  stream: string;
}

async function describeTasks(ecs: ECSClient, cluster: string, arns: readonly string[]) {
  const batches = await Promise.all(
    chunks(arns, DESCRIBE_BATCH.tasks).map(
      async (batch) => (await ecs.send(new DescribeTasksCommand({ cluster, tasks: batch }))).tasks,
    ),
  );
  return batches
    .flatMap((batch) => batch ?? [])
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// Chỉ gọi khi cluster đã chắc có: ListTasks với cluster lạ trả 400, "default" thì bị Floci tạo
export async function listTasks(ecs: ECSClient, cluster: string, filter: TaskFilter) {
  const arns = await collectPages(
    paginateListTasks({ client: ecs }, { cluster, ...filter }),
    (page) => page.taskArns,
  );
  return describeTasks(ecs, cluster, arns);
}

// null = task không có: Floci không lưu task qua restart (spec 7 #12)
export const getTask = async (ecs: ECSClient, cluster: string, taskId: string) =>
  (await describeTasks(ecs, cluster, [taskId]))[0] ?? null;

export const runTask = async (ecs: ECSClient, input: RunTaskCommandInput) =>
  runTaskOutcome(await ecs.send(new RunTaskCommand(input)));

export const stopTasks = (ecs: ECSClient, cluster: string, arns: readonly string[]) =>
  runEach(arns, taskIdOf, (arn) =>
    ecs.send(new StopTaskCommand({ cluster, task: arn, reason: STOP_REASON })),
  );

// Hỏi group và stream trước: thiếu thì GetLogEvents trả 400, trình duyệt ghi console.error
export async function getTaskLogs(logs: LogsService, { group, stream }: LogTarget) {
  if (!(await logs.logGroupExists(group))) return [];
  if (!(await logs.logStreamExists(group, stream))) return [];
  return logs.readStreamFromHead(group, stream);
}
