import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  PutRuleCommand,
  ResourceNotFoundException,
  TestEventPatternCommand,
} from "@aws-sdk/client-eventbridge";
import { isNotFoundError } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { RULE_STATES, type RuleType } from "../constants.ts";
import { listBuses } from "../buses.ts";
import { matchesS3Bucket } from "../pattern.ts";
import { deleteRule, listRules, listTargets, toRule, type Rule } from "../rules.ts";
import { EVENTBRIDGE_QUERY_ROOT, invalidateExcept } from "./useBuses.ts";
import { useEventBridge } from "./useEventBridge.ts";

const rulesQueryKey = (bus: string) => [EVENTBRIDGE_QUERY_ROOT, "bus", bus, "rule-list"];
const ruleQueryKey = (bus: string, rule: string) => [EVENTBRIDGE_QUERY_ROOT, "rule", bus, rule];

export const isRuleMissing = (error: unknown) =>
  error instanceof ResourceNotFoundException || isNotFoundError(error);

export interface RuleRow extends Rule {
  targets: number;
}

export function useRules(bus: string) {
  const client = useEventBridge();
  return useQuery({
    queryKey: rulesQueryKey(bus),
    queryFn: async () => {
      const rules = await listRules(client, bus);
      // Local ít rule nên đếm target từng rule song song
      return Promise.all(
        rules.map(async (rule): Promise<RuleRow> => {
          return { ...rule, targets: (await listTargets(client, bus, rule.name)).length };
        }),
      );
    },
  });
}

// Rule ở mọi bus đang bắt event S3 của bucket, để cảnh báo trước khi tắt EventBridge cho bucket
export function useS3EventRules(bucket: string, enabled: boolean) {
  const client = useEventBridge();
  return useQuery({
    queryKey: [EVENTBRIDGE_QUERY_ROOT, "s3-rules", bucket],
    // Chỉ cần khi EventBridge của bucket đang bật (tắt rồi thì không còn gì để cảnh báo)
    enabled,
    queryFn: async () => {
      const perBus = await Promise.all(
        (await listBuses(client)).map((bus) => listRules(client, bus.name)),
      );
      return perBus.flat().filter((rule) => matchesS3Bucket(rule.eventPattern, bucket));
    },
  });
}

export function useRule(bus: string, name: string) {
  const client = useEventBridge();
  return useQuery({
    queryKey: ruleQueryKey(bus, name),
    queryFn: async () => ({
      ...toRule(await client.send(new DescribeRuleCommand({ EventBusName: bus, Name: name }))),
      // Floci có thể bỏ EventBusName khỏi kết quả
      bus,
    }),
    retry: false,
    // Trang tạo rule chưa có tên để hỏi
    enabled: Boolean(name),
  });
}

interface PutRuleInput {
  bus: string;
  name: string;
  description: string;
  type: RuleType;
  eventPattern: string;
  scheduleExpression: string;
  enabled: boolean;
}

// PutRule ghi đè cả rule: sửa thì giữ trường form không có (RoleArn của rule do IaC tạo)
export function usePutRule(existing?: Rule) {
  const client = useEventBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PutRuleInput) =>
      client.send(
        new PutRuleCommand({
          EventBusName: input.bus,
          Name: input.name,
          Description: input.description || undefined,
          EventPattern: input.type === "pattern" ? input.eventPattern : undefined,
          ScheduleExpression: input.type === "schedule" ? input.scheduleExpression : undefined,
          State: input.enabled ? RULE_STATES.enabled : RULE_STATES.disabled,
          RoleArn: existing?.roleArn,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] }),
  });
}

export function useSetRulesEnabled() {
  const client = useEventBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rules, enabled }: { rules: readonly Rule[]; enabled: boolean }) =>
      runEach(
        rules,
        (rule) => rule.name,
        (rule) => {
          const input = { EventBusName: rule.bus, Name: rule.name };
          return client.send(
            enabled ? new EnableRuleCommand(input) : new DisableRuleCommand(input),
          );
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] }),
  });
}

export function useDeleteRules() {
  const client = useEventBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: readonly Rule[]) =>
      runEach(
        rules,
        (rule) => rule.name,
        (rule) => deleteRule(client, rule.bus, rule.name),
      ),
    onSuccess: (_result, rules) =>
      invalidateExcept(
        queryClient,
        rules.map((rule) => ruleQueryKey(rule.bus, rule.name)),
      ),
  });
}

export function useTestPattern() {
  const client = useEventBridge();
  return useMutation({
    mutationFn: async ({ pattern, event }: { pattern: string; event: string }) =>
      (await client.send(new TestEventPatternCommand({ EventPattern: pattern, Event: event })))
        .Result === true,
  });
}
