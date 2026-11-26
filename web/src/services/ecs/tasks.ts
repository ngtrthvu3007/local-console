import type { Failure, Task } from "@aws-sdk/client-ecs";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";

const FAILURE_SEPARATOR = "; ";

const failureText = (failure: Failure) =>
  [failure.arn, failure.reason, failure.detail].filter(Boolean).join(": ");

// RunTask báo task không chạy được trong failures chứ không ném lỗi. Không task nào chạy thì ném
// (form giữ nguyên, báo lỗi); chạy được một phần thì trả kết quả theo dạng notifyBulkOutcome cần
export function runTaskOutcome(result: { tasks?: Task[]; failures?: Failure[] }) {
  const tasks = result.tasks ?? [];
  const failures = (result.failures ?? []).map(failureText);
  if (!tasks.length) throw new Error(failures.join(FAILURE_SEPARATOR));
  return { tasks, count: tasks.length, failures };
}

// Exit code của task: một container thì chỉ mã; nhiều container thì từng container kèm tên
export function exitCodeText(task: Pick<Task, "containers">) {
  const exited = (task.containers ?? []).filter((container) => container.exitCode !== undefined);
  if (!exited.length) return undefined;
  if (exited.length === 1) return String(exited[0].exitCode);
  return exited
    .map((container) => `${container.name} ${container.exitCode}`)
    .join(DETAIL_SEPARATOR);
}
