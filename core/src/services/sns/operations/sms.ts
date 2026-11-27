import { PublishCommand, type SNSClient } from "@aws-sdk/client-sns";
import type { z } from "zod";
import { FLOCI_ENDPOINTS, flociUrl } from "#shared/floci/endpoints.ts";
import { fetchJson } from "#shared/http/fetchJson.ts";
import { SMS_TYPE_ATTRIBUTE } from "#services/sns/constants.ts";
import type { publishSmsSchema } from "#services/sns/schemas.ts";
import { smsForRegion, smsInboxSchema } from "#services/sns/smsInbox.ts";

export type PublishSmsInput = z.output<typeof publishSmsSchema>;

export async function listSms(baseUrl: string, region: string) {
  const body = smsInboxSchema.parse(
    await fetchJson<unknown>(flociUrl(baseUrl, FLOCI_ENDPOINTS.snsSms)),
  );
  return smsForRegion(body.messages, region);
}

// DELETE /_aws/sns của Floci chỉ có xóa hết tin của mọi region, không nhận ?id= như SES (spec SMS 7 #2)
export const clearSms = (baseUrl: string) =>
  fetchJson(flociUrl(baseUrl, FLOCI_ENDPOINTS.snsSms), { method: "DELETE" });

export const publishSms = (sns: SNSClient, { phoneNumber, message, type }: PublishSmsInput) =>
  sns.send(
    new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
      MessageAttributes: { [SMS_TYPE_ATTRIBUTE]: { DataType: "String", StringValue: type } },
    }),
  );
