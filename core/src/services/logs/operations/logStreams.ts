import {
  CreateLogStreamCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
  paginateDescribeLogStreams,
  type CloudWatchLogsClient,
  type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import { collectPages } from "#shared/aws/pagination.ts";
import { logGroupExists, logStreamExists } from "./events.ts";

export async function listLogStreams(logs: CloudWatchLogsClient, group: string) {
  // Group bị xóa (ở đây hoặc nơi khác) thì Describe trả 400: kiểm trước, như listLogEvents
  if (!(await logGroupExists(logs, group))) return [];

  return collectPages(
    paginateDescribeLogStreams(
      { client: logs },
      { logGroupName: group, orderBy: "LastEventTime", descending: true },
    ),
    (page) => page.logStreams,
  );
}

export interface StreamEventsPage {
  missing?: boolean;
  events: OutputLogEvent[]; // cũ → mới, như API trả
  requestToken?: string;
  backwardToken?: string;
}

// Một trang event của stream, đi lùi từ cuối (giống AWS) theo nextBackwardToken.
// Hết event cũ thì Floci trả lại đúng token vừa gửi
export async function getStreamEventsPage(
  logs: CloudWatchLogsClient,
  { group, stream, token }: { group: string; stream: string; token?: string },
): Promise<StreamEventsPage> {
  if (!token && !(await logStreamExists(logs, group, stream))) return { missing: true, events: [] };

  const { events = [], nextBackwardToken } = await logs.send(
    new GetLogEventsCommand({
      logGroupName: group,
      logStreamName: stream,
      startFromHead: false,
      nextToken: token,
    }),
  );
  return { events, requestToken: token, backwardToken: nextBackwardToken };
}

export async function sendTestEvent(
  logs: CloudWatchLogsClient,
  { group, stream, message }: { group: string; stream: string; message: string },
) {
  if (!(await logStreamExists(logs, group, stream)))
    await logs.send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: stream }));
  await logs.send(
    new PutLogEventsCommand({
      logGroupName: group,
      logStreamName: stream,
      logEvents: [{ timestamp: Date.now(), message }],
    }),
  );
}

// ponytail: chỉ đọc trang đầu của GetLogEvents (tới 10 000 dòng), đủ cho một task chạy ở local
export const readStreamFromHead = async (
  logs: CloudWatchLogsClient,
  group: string,
  stream: string,
) =>
  (
    await logs.send(
      new GetLogEventsCommand({ logGroupName: group, logStreamName: stream, startFromHead: true }),
    )
  ).events ?? [];
