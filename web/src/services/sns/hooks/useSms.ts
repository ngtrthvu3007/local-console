import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SMS_REFRESH_INTERVAL_MS, type PublishSmsInput } from "@localconsole/core/sns";
import { SNS_QUERY_ROOT } from "./useTopics.ts";
import { useSnsService } from "./useSnsService.ts";

const smsQueryKey = [SNS_QUERY_ROOT, "sms"];

export function useSmsInbox(autoRefresh = false) {
  const sns = useSnsService();

  return useQuery({
    queryKey: smsQueryKey,
    queryFn: sns.listSms,
    refetchInterval: autoRefresh ? SMS_REFRESH_INTERVAL_MS : false,
  });
}

export function useClearSms() {
  const sns = useSnsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sns.clearSms,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: smsQueryKey }),
  });
}

export function usePublishSms() {
  const sns = useSnsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PublishSmsInput) => sns.publishSms(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: smsQueryKey }),
  });
}
