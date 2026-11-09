import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeTimeToLiveCommand,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
  type StreamSpecification,
} from "@aws-sdk/client-dynamodb";
import {
  paginateListEventSourceMappings,
  type EventSourceMappingConfiguration,
} from "@aws-sdk/client-lambda";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { createStreamTrigger, type StreamTriggerInput } from "../../lambda/hooks/useTriggers.ts";
import type { StreamViewTypeId } from "../constants.ts";
import { useDynamoDB } from "./useDynamoDB.ts";
import { tableQueryKey, useInvalidateTable } from "./useTables.ts";

const TTL = "ttl";
const STREAM_TRIGGERS = "stream-triggers";

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

// Các Lambda đang đọc stream của bảng
export function useStreamTriggers(table: string, streamArn?: string) {
  const { lambda } = useLambda();
  return useQuery({
    queryKey: [...tableQueryKey(table, STREAM_TRIGGERS), streamArn],
    enabled: Boolean(streamArn),
    queryFn: async () => {
      const mappings: EventSourceMappingConfiguration[] = [];
      const paginator = paginateListEventSourceMappings(
        { client: lambda },
        { EventSourceArn: streamArn },
      );
      for await (const page of paginator) mappings.push(...(page.EventSourceMappings ?? []));
      return mappings;
    },
  });
}

export function useAddStreamTrigger(table: string, streamArn: string) {
  const { lambda } = useLambda();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<StreamTriggerInput, "streamArn">) =>
      createStreamTrigger(lambda, { ...input, streamArn }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tableQueryKey(table, STREAM_TRIGGERS) }),
  });
}
