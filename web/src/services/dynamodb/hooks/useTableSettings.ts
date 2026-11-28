import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StreamChange, TimeToLiveChange } from "@localconsole/core/dynamodb";
import { useDynamoDbService } from "./useDynamoDbService.ts";
import { tableQueryKey, useInvalidateTable } from "./useTables.ts";

const TTL = "ttl";

export function useTimeToLive(table: string) {
  const dynamodb = useDynamoDbService();

  return useQuery({
    queryKey: tableQueryKey(table, TTL),
    queryFn: () => dynamodb.getTimeToLive(table),
  });
}

export function useUpdateTimeToLive(table: string) {
  const dynamodb = useDynamoDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: TimeToLiveChange) => dynamodb.updateTimeToLive(table, change),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tableQueryKey(table, TTL) }),
  });
}

export function useUpdateStream(table: string) {
  const dynamodb = useDynamoDbService();
  const invalidate = useInvalidateTable();

  return useMutation({
    mutationFn: (change: StreamChange) => dynamodb.updateStream(table, change),
    onSuccess: () => invalidate(table),
  });
}
