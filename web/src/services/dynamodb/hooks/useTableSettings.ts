import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeTimeToLiveCommand,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
  type StreamSpecification,
} from "@aws-sdk/client-dynamodb";
import type { StreamViewTypeId } from "../constants.ts";
import { useDynamoDB } from "./useDynamoDB.ts";
import { tableQueryKey, useInvalidateTable } from "./useTables.ts";

const TTL = "ttl";

export function useTimeToLive(table: string) {
  const client = useDynamoDB();
  return useQuery({
    queryKey: tableQueryKey(table, TTL),
    queryFn: async () =>
      (await client.send(new DescribeTimeToLiveCommand({ TableName: table })))
        .TimeToLiveDescription ?? {},
  });
}

export function useUpdateTimeToLive(table: string) {
  const client = useDynamoDB();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enabled, attributeName }: { enabled: boolean; attributeName: string }) =>
      client.send(
        new UpdateTimeToLiveCommand({
          TableName: table,
          TimeToLiveSpecification: { Enabled: enabled, AttributeName: attributeName },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tableQueryKey(table, TTL) }),
  });
}

interface StreamChange {
  enabled: boolean;
  viewType: StreamViewTypeId;
  current?: StreamSpecification;
}

const updateStream = (table: string, specification: StreamSpecification) =>
  new UpdateTableCommand({ TableName: table, StreamSpecification: specification });

// DynamoDB không cho đổi loại dữ liệu khi stream đang bật: tắt rồi bật lại (stream ARN đổi)
export function useUpdateStream(table: string) {
  const client = useDynamoDB();
  const invalidate = useInvalidateTable();
  return useMutation({
    mutationFn: async ({ enabled, viewType, current }: StreamChange) => {
      if (!enabled) return client.send(updateStream(table, { StreamEnabled: false }));
      if (current?.StreamEnabled) {
        if (current.StreamViewType === viewType) return undefined;
        await client.send(updateStream(table, { StreamEnabled: false }));
      }
      return client.send(updateStream(table, { StreamEnabled: true, StreamViewType: viewType }));
    },
    onSuccess: () => invalidate(table),
  });
}
