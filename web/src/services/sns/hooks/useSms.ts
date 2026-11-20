import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublishCommand } from "@aws-sdk/client-sns";
import type { z } from "zod";
import { fetchJson } from "@shared/api.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { SMS_INBOX_PATH, SMS_REFRESH_INTERVAL_MS, SMS_TYPE_ATTRIBUTE } from "../constants.ts";
import type { publishSmsSchema } from "../schemas.ts";
import { smsForRegion, smsInboxSchema } from "../smsInbox.ts";
import { useSNS } from "./useSNS.ts";
import { SNS_QUERY_ROOT } from "./useTopics.ts";

const smsQueryKey = [SNS_QUERY_ROOT, "sms"];

export function useSmsInbox(autoRefresh = false) {
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: smsQueryKey,
    queryFn: async () => {
      const body = smsInboxSchema.parse(await fetchJson<unknown>(SMS_INBOX_PATH));
      return smsForRegion(body.messages, region);
    },
    refetchInterval: autoRefresh ? SMS_REFRESH_INTERVAL_MS : false,
  });
}

// Floci bỏ qua ?id= và xóa tin của mọi region: không có cách xóa từng tin (spec SMS 7 #2)
export function useClearSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson(SMS_INBOX_PATH, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: smsQueryKey }),
  });
}

export function usePublishSms() {
  const client = useSNS();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ phoneNumber, message, type }: z.output<typeof publishSmsSchema>) =>
      client.send(
        new PublishCommand({
          PhoneNumber: phoneNumber,
          Message: message,
          MessageAttributes: { [SMS_TYPE_ATTRIBUTE]: { DataType: "String", StringValue: type } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: smsQueryKey }),
  });
}
