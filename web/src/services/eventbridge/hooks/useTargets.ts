import { useMutation, useQuery } from "@tanstack/react-query";
import { PutTargetsCommand, RemoveTargetsCommand } from "@aws-sdk/client-eventbridge";
import { listTargets } from "../rules.ts";
import { EVENTBRIDGE_QUERY_ROOT, useInvalidateEventBridge } from "./useBuses.ts";
import { useEventBridge } from "./useEventBridge.ts";

const targetsQueryKey = (bus: string, rule: string) => [
  EVENTBRIDGE_QUERY_ROOT,
  "rule",
  bus,
  rule,
  "targets",
];

export function useTargets(bus: string, rule: string) {
  const client = useEventBridge();
  return useQuery({
    queryKey: targetsQueryKey(bus, rule),
    queryFn: () => listTargets(client, bus, rule),
  });
}

interface AddTargetInput {
  arn: string;
  id: string;
  messageGroupId?: string; // queue FIFO
}

export function useAddTarget(bus: string, rule: string) {
  const client = useEventBridge();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: async ({ arn, id, messageGroupId }: AddTargetInput) => {
      const result = await client.send(
        new PutTargetsCommand({
          EventBusName: bus,
          Rule: rule,
          Targets: [
            {
              Id: id,
              Arn: arn,
              SqsParameters: messageGroupId ? { MessageGroupId: messageGroupId } : undefined,
            },
          ],
        }),
      );
      // PutTargets báo lỗi từng target ở đây chứ không ném
      if (result.FailedEntryCount)
        throw new Error(result.FailedEntries?.[0]?.ErrorMessage ?? "Couldn't add the target");
    },
    onSuccess: invalidate,
  });
}

export function useRemoveTargets(bus: string, rule: string) {
  const client = useEventBridge();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: (ids: string[]) =>
      client.send(new RemoveTargetsCommand({ EventBusName: bus, Rule: rule, Ids: ids })),
    onSuccess: invalidate,
  });
}
