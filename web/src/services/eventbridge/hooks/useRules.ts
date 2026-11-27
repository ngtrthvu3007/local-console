import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PutRuleInput, Rule } from "@localconsole/core/eventbridge";
import { EVENTBRIDGE_QUERY_ROOT, invalidateExcept } from "./useBuses.ts";
import { useEventBridgeService } from "./useEventBridgeService.ts";

const rulesQueryKey = (bus: string) => [EVENTBRIDGE_QUERY_ROOT, "bus", bus, "rule-list"];
const ruleQueryKey = (bus: string, rule: string) => [EVENTBRIDGE_QUERY_ROOT, "rule", bus, rule];

export function useRules(bus: string) {
  const eventbridge = useEventBridgeService();

  return useQuery({ queryKey: rulesQueryKey(bus), queryFn: () => eventbridge.listRuleRows(bus) });
}

// Chỉ cần khi EventBridge của bucket đang bật (tắt rồi thì không còn gì để cảnh báo)
export function useS3EventRules(bucket: string, enabled: boolean) {
  const eventbridge = useEventBridgeService();

  return useQuery({
    queryKey: [EVENTBRIDGE_QUERY_ROOT, "s3-rules", bucket],
    enabled,
    queryFn: () => eventbridge.listS3EventRules(bucket),
  });
}

export function useRule(bus: string, name: string) {
  const eventbridge = useEventBridgeService();

  return useQuery({
    queryKey: ruleQueryKey(bus, name),
    queryFn: () => eventbridge.getRule(bus, name),
    retry: false,
    // Trang tạo rule chưa có tên để hỏi
    enabled: Boolean(name),
  });
}

export function usePutRule(existing?: Rule) {
  const eventbridge = useEventBridgeService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PutRuleInput) => eventbridge.putRule(input, existing),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] }),
  });
}

export function useSetRulesEnabled() {
  const eventbridge = useEventBridgeService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rules, enabled }: { rules: readonly Rule[]; enabled: boolean }) =>
      eventbridge.setRulesEnabled(rules, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] }),
  });
}

export function useDeleteRules() {
  const eventbridge = useEventBridgeService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: eventbridge.deleteRules,
    onSuccess: (_result, rules) =>
      invalidateExcept(
        queryClient,
        rules.map((rule) => ruleQueryKey(rule.bus, rule.name)),
      ),
  });
}

export function useTestPattern() {
  const eventbridge = useEventBridgeService();

  return useMutation({ mutationFn: eventbridge.testPattern });
}
