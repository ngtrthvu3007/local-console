import {
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  PutSubscriptionFilterCommand,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { runEach } from "#shared/utils/bulk.ts";
import { logGroupExists } from "./events.ts";

export interface NewSubscriptionFilter {
  name: string;
  filterPattern: string;
  destinationArn: string;
}

export async function listSubscriptionFilters(logs: CloudWatchLogsClient, group: string) {
  // Group bị xóa (ở đây hoặc nơi khác) thì Describe trả 400: kiểm trước, như listLogEvents
  if (!(await logGroupExists(logs, group))) return [];
  const { subscriptionFilters = [] } = await logs.send(
    new DescribeSubscriptionFiltersCommand({ logGroupName: group }),
  );
  return subscriptionFilters;
}

// Không gọi AddPermission, không gửi roleArn: Floci không kiểm (giống EventBridge, Cognito)
export const putSubscriptionFilter = (
  logs: CloudWatchLogsClient,
  group: string,
  { name, filterPattern, destinationArn }: NewSubscriptionFilter,
) =>
  logs.send(
    new PutSubscriptionFilterCommand({
      logGroupName: group,
      filterName: name,
      filterPattern,
      destinationArn,
    }),
  );

export const deleteSubscriptionFilters = (
  logs: CloudWatchLogsClient,
  group: string,
  names: readonly string[],
) =>
  runEach(
    names,
    (name) => name,
    (name) =>
      logs.send(new DeleteSubscriptionFilterCommand({ logGroupName: group, filterName: name })),
  );
