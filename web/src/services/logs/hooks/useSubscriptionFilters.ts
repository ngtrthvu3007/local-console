import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LOGS_KEYS, LOGS_QUERY_ROOT } from "@shared/logs/constants.ts";
import { logGroupExists } from "@shared/logs/useLogEvents.ts";
import { useLogsClient } from "@shared/logs/useLogsClient.ts";

const filtersKey = (group: string) => [LOGS_QUERY_ROOT, LOGS_KEYS.subscriptions, group];

export function useSubscriptionFilters(group: string) {
  const client = useLogsClient();

  return useQuery({
    queryKey: filtersKey(group),
    queryFn: async () => {
      // Group bị xóa (ở đây hoặc nơi khác) thì Describe trả 400: kiểm trước, như useLogEvents
      if (!(await logGroupExists(client, group))) return [];
      const { subscriptionFilters = [] } = await client.send(
        new DescribeSubscriptionFiltersCommand({ logGroupName: group }),
      );
      return subscriptionFilters;
    },
  });
}

interface NewFilter {
  name: string;
  filterPattern: string;
  destinationArn: string;
}

// Không gọi AddPermission, không gửi roleArn: Floci không kiểm (giống EventBridge, Cognito)
export function usePutSubscriptionFilter(group: string) {
  const client = useLogsClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, filterPattern, destinationArn }: NewFilter) =>
      client.send(
        new PutSubscriptionFilterCommand({
          logGroupName: group,
          filterName: name,
          filterPattern,
          destinationArn,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filtersKey(group) }),
  });
}

export function useDeleteSubscriptionFilters(group: string) {
  const client = useLogsClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) =>
      runEach(
        names,
        (name) => name,
        (name) =>
          client.send(
            new DeleteSubscriptionFilterCommand({ logGroupName: group, filterName: name }),
          ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filtersKey(group) }),
  });
}
