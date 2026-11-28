import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DeleteRetentionPolicyCommand,
  PutRetentionPolicyCommand,
  paginateDescribeLogGroups,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { findLogGroup } from "./events.ts";

// Floci bỏ qua logGroupNamePattern nên lọc ở server theo prefix (spec 7 #2)
export const listLogGroups = (logs: CloudWatchLogsClient, prefix: string) =>
  collectPages(
    paginateDescribeLogGroups({ client: logs }, { logGroupNamePrefix: prefix || undefined }),
    (page) => page.logGroups,
  );

export const getLogGroup = async (logs: CloudWatchLogsClient, name: string) =>
  (await findLogGroup(logs, name)) ?? null;

export async function createLogGroup(
  logs: CloudWatchLogsClient,
  { name, days }: { name: string; days?: number },
) {
  await logs.send(new CreateLogGroupCommand({ logGroupName: name }));
  // Group đã tạo xong: retention lỗi thì vẫn trả group (để mở trang của nó) kèm lỗi, không ném
  const retentionError =
    days === undefined
      ? undefined
      : await logs
          .send(new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: days }))
          .then(
            () => undefined,
            (error: unknown) => error,
          );
  return { name, retentionError };
}

export const deleteLogGroup = (logs: CloudWatchLogsClient, name: string) =>
  logs.send(new DeleteLogGroupCommand({ logGroupName: name }));

export const deleteLogGroups = (logs: CloudWatchLogsClient, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => logs.send(new DeleteLogGroupCommand({ logGroupName: name })),
  );

// undefined = Never expire: AWS bỏ retention bằng DeleteRetentionPolicy
export async function putRetention(
  logs: CloudWatchLogsClient,
  { name, days }: { name: string; days: number | undefined },
) {
  if (days === undefined) await logs.send(new DeleteRetentionPolicyCommand({ logGroupName: name }));
  else
    await logs.send(new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: days }));
}
