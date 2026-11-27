import {
  DescribeLogStreamsCommand,
  paginateDescribeLogGroups,
  paginateFilterLogEvents,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { collectPages } from "#shared/aws/pagination.ts";
import { LOG_RANGES, type LogRangeId } from "#services/logs/constants.ts";
import { logMessageText } from "#services/logs/format.ts";

// Hỏi trước khi đọc: gọi theo tên một group / stream chưa có thì Floci trả 400, trình duyệt ghi
// console.error. Lọc theo tiền tố rồi so đúng tên: /aws/lambda/demo cũng khớp /aws/lambda/demo-consumer
export async function findLogGroup(logs: CloudWatchLogsClient, name: string) {
  for await (const page of paginateDescribeLogGroups(
    { client: logs },
    { logGroupNamePrefix: name },
  )) {
    const found = page.logGroups?.find((group) => group.logGroupName === name);
    if (found) return found;
  }
  return undefined;
}

export const logGroupExists = async (logs: CloudWatchLogsClient, name: string) =>
  Boolean(await findLogGroup(logs, name));

// Group phải có trước: hỏi stream của group không có cũng trả 400
export async function logStreamExists(logs: CloudWatchLogsClient, group: string, stream: string) {
  const { logStreams = [] } = await logs.send(
    new DescribeLogStreamsCommand({ logGroupName: group, logStreamNamePrefix: stream }),
  );
  return logStreams.some((item) => item.logStreamName === stream);
}

export interface LogEventsInput {
  logGroupName: string;
  rangeId: LogRangeId;
  filterPattern: string;
}

// API trả cũ → mới theo trang nên phải tải hết khoảng thời gian rồi mới đảo được
// ponytail: tải hết log trong khoảng (local ít log); log quá nhiều thì đọc ngược từng log stream
export async function listLogEvents(
  logs: CloudWatchLogsClient,
  { logGroupName, rangeId, filterPattern }: LogEventsInput,
) {
  const range = LOG_RANGES.find((candidate) => candidate.id === rangeId)!;
  if (!(await logGroupExists(logs, logGroupName))) return [];

  const paginator = paginateFilterLogEvents(
    { client: logs },
    {
      logGroupName,
      startTime: Date.now() - range.milliseconds,
      filterPattern: filterPattern || undefined,
    },
  );

  return (await collectPages(paginator, (page) => page.events)).reverse();
}

export async function readLogMessages(
  logs: CloudWatchLogsClient,
  {
    logGroupName,
    startTime,
    endTime,
  }: { logGroupName: string; startTime: number; endTime: number },
) {
  const paginator = paginateFilterLogEvents({ client: logs }, { logGroupName, startTime, endTime });
  const events = await collectPages(paginator, (page) => page.events);

  return events.map((event) => logMessageText(event.message)).join("\n");
}
