import { z } from "zod";

export { sentAt } from "#shared/floci/inbox.ts";
import { VIETNAM_MOBILE_NUMBER_FORMAT, VIETNAM_MOBILE_NUMBER_PATTERN } from "./constants.ts";

const smsSchema = z.object({
  Id: z.string(),
  Region: z.string(),
  PhoneNumber: z.string(),
  Message: z.string(),
  Subject: z.string().nullish(),
  Timestamp: z.string(),
});
export type Sms = z.infer<typeof smsSchema>;

export const smsInboxSchema = z.object({ messages: z.array(smsSchema) });

export function matchesSearch(sms: Sms, search: string): boolean {
  if (!search) return true;
  const searchText = search.toLowerCase();
  return [sms.PhoneNumber, formatPhoneNumber(sms.PhoneNumber), sms.Message].some((text) =>
    text.toLowerCase().includes(searchText),
  );
}

export function formatPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(VIETNAM_MOBILE_NUMBER_PATTERN, VIETNAM_MOBILE_NUMBER_FORMAT);
}
