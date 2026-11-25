import { useMutation, useQuery } from "@tanstack/react-query";
import { PutTargetsCommand, RemoveTargetsCommand } from "@aws-sdk/client-eventbridge";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import { useTopics } from "../../sns/hooks/useTopics.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { useStateMachines } from "../../stepfunctions/hooks/useStateMachines.ts";
import { listTargets } from "../rules.ts";
import { ADDABLE_TARGET_KINDS, TARGET_KINDS, type AddableTargetKind } from "../targets.ts";
import { EVENTBRIDGE_QUERY_ROOT, useBuses, useInvalidateEventBridge } from "./useBuses.ts";
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

// Ô chọn target dùng chung cho rule và schedule
export const TARGET_KIND_OPTIONS = ADDABLE_TARGET_KINDS.map((kind) => ({
  value: kind,
  label: TARGET_KINDS[kind],
}));

// excludeBus: bus của rule, bỏ khỏi danh sách để event không quay vòng lại chính nó
export function useTargetOptions(excludeBus?: string) {
  const functions = useFunctions();
  const queues = useQueues();
  const topics = useTopics();
  const buses = useBuses();
  const stateMachines = useStateMachines();

  const optionsByKind: Record<AddableTargetKind, { value: string; label: string }[]> = {
    lambda: (functions.data ?? []).map((fn) => ({
      value: fn.FunctionArn ?? "",
      label: fn.FunctionName ?? "",
    })),
    sqs: (queues.data ?? []).map((queue) => ({ value: queue.arn, label: queue.name })),
    sns: (topics.data ?? []).map((topic) => ({ value: topic.arn, label: topic.name })),
    eventbus: (buses.data ?? [])
      .filter((bus) => bus.name !== excludeBus)
      .map((bus) => ({ value: bus.arn, label: bus.name })),
    stepfunctions: (stateMachines.data ?? []).map((machine) => ({
      value: machine.arn,
      label: machine.name,
    })),
  };

  const emptyText: Record<AddableTargetKind, string> = {
    lambda: "No functions",
    sqs: "No queues",
    sns: "No topics",
    eventbus: excludeBus ? "No other event buses" : "No event buses",
    stepfunctions: "No state machines",
  };

  const fifoArns = new Set((queues.data ?? []).filter((queue) => queue.fifo).map((q) => q.arn));
  return { optionsByKind, emptyText, fifoArns };
}
