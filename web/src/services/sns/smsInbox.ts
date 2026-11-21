import { z } from "zod";
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

// Timestamp có tới 9 chữ số lẻ, nên so bằng số chứ không so chuỗi
export const sentAt = (sms: Sms) => Date.parse(sms.Timestamp);

// Hộp thư của Floci dùng chung mọi region và trả tin cũ nhất trước
export function smsForRegion(messages: Sms[], region: string): Sms[] {
  return messages
    .filter((sms) => sms.Region === region)
    .sort((first, second) => sentAt(second) - sentAt(first));
}

export function matchesSearch(sms: Sms, search: string): boolean {
  if (!search) return true;
  const searchText = search.toLowerCase();
  // Số điện thoại tìm được cả theo dạng đang hiển thị (+84 900 …) lẫn dạng gốc (+84900…)
  return [sms.PhoneNumber, formatPhoneNumber(sms.PhoneNumber), sms.Message].some((text) =>
    text.toLowerCase().includes(searchText),
  );
}

export function formatPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(VIETNAM_MOBILE_NUMBER_PATTERN, VIETNAM_MOBILE_NUMBER_FORMAT);
}
