import { z } from "zod";
import { fromBase64 } from "#shared/utils/encoding.ts";
import { ADDRESS_SEPARATOR, UNNAMED_ATTACHMENT } from "./constants.ts";

// Mail SendRawEmail chỉ có RawData, mail bị chặn chỉ có RejectReason (spec 7 #6, #17) nên mọi field khác đều có thể thiếu
const addressListSchema = z.array(z.string()).nullish();

const emailSchema = z.object({
  Id: z.string(),
  Region: z.string(),
  Timestamp: z.string(),
  Source: z.string().nullish(),
  ReturnPath: z.string().nullish(),
  Subject: z.string().nullish(),
  RawData: z.string().nullish(),
  RejectReason: z.string().nullish(),
  Destination: z
    .object({
      ToAddresses: addressListSchema,
      CcAddresses: addressListSchema,
      BccAddresses: addressListSchema,
    })
    .nullish(),
  ReplyToAddresses: addressListSchema,
  Body: z.object({ text_part: z.string().nullish(), html_part: z.string().nullish() }).nullish(),
  Attachments: z
    .array(
      z.object({
        FileName: z.string(),
        ContentType: z.string().nullish(),
        Size: z.number().nullish(),
      }),
    )
    .nullish(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).nullish(),
});

export type Email = z.infer<typeof emailSchema>;

export const mailboxSchema = z.object({ messages: z.array(emailSchema) });

export const sentAt = (email: Email) => Date.parse(email.Timestamp);

// Hộp thư của Floci dùng chung mọi region và trả mail cũ nhất trước
export function mailboxForRegion(messages: Email[], region: string): Email[] {
  return messages
    .filter((email) => email.Region === region)
    .sort((first, second) => sentAt(second) - sentAt(first));
}

export function recipientsOf(email: Email): string[] {
  const destination = email.Destination;

  return [destination?.ToAddresses, destination?.CcAddresses, destination?.BccAddresses].flatMap(
    (addresses) => addresses ?? [],
  );
}

export function matchesSearch(email: Email, search: string): boolean {
  // Ô tìm rỗng phải giữ cả mail không có field để tìm (mail bị chặn chỉ có RejectReason)
  if (!search) return true;
  const searchText = search.toLowerCase();

  return [...recipientsOf(email), email.Source, email.Subject].some((text) =>
    text?.toLowerCase().includes(searchText),
  );
}

export interface HeaderLine {
  name: string;
  value: string;
}

const joinAddresses = (addresses: string[] | null | undefined) =>
  addresses?.join(ADDRESS_SEPARATOR);

// Mail không có RawData thì không có header gốc: dựng lại từ field Floci đã tách sẵn
export function headersFromFields(email: Email): HeaderLine[] {
  const lines = [
    { name: "From", value: email.Source },
    { name: "Return-Path", value: email.ReturnPath },
    { name: "To", value: joinAddresses(email.Destination?.ToAddresses) },
    { name: "Cc", value: joinAddresses(email.Destination?.CcAddresses) },
    { name: "Bcc", value: joinAddresses(email.Destination?.BccAddresses) },
    { name: "Reply-To", value: joinAddresses(email.ReplyToAddresses) },
    { name: "Subject", value: email.Subject },
    { name: "Date", value: new Date(sentAt(email)).toUTCString() },
    ...(email.Headers ?? []).map(({ Name, Value }) => ({ name: Name, value: Value })),
  ];

  return lines.filter((line): line is HeaderLine => Boolean(line.value));
}

interface EmailAttachment {
  fileName: string;
  mimeType: string;
  content: ArrayBuffer | Uint8Array<ArrayBuffer>;
}

interface EmailContent {
  subject?: string;
  to: string[];
  html?: string;
  text?: string;
  headers: HeaderLine[];
  attachments: EmailAttachment[];
}

export async function readEmail(email: Email): Promise<EmailContent> {
  if (!email.RawData) return contentFromFields(email);

  try {
    return await contentFromMime(email.RawData);
  } catch {
    // RawData hỏng (base64 sai, MIME lỗi): vẫn xem được phần Floci đã tách sẵn
    return contentFromFields(email);
  }
}

async function contentFromMime(rawData: string): Promise<EmailContent> {
  const bytes = fromBase64(rawData);
  // Chỉ tải postal-mime khi mở mail có RawData
  const { default: PostalMime } = await import("postal-mime");
  const mime = await PostalMime.parse(bytes);

  return {
    subject: mime.subject,
    to: (mime.to ?? [])
      .flatMap((address) => address.group ?? address)
      .map(({ address }) => address),
    html: mime.html,
    text: mime.text,
    headers: mime.headers.map(({ key, value }) => ({ name: key, value })),
    attachments: mime.attachments.map((attachment) => ({
      fileName: attachment.filename ?? UNNAMED_ATTACHMENT,
      mimeType: attachment.mimeType,
      // attachmentEncoding mặc định cho ArrayBuffer, riêng lịch (.ics) là Uint8Array; type của postal-mime có cả string dù không xảy ra
      content: attachment.content as EmailAttachment["content"],
    })),
  };
}

const contentFromFields = (email: Email): EmailContent => ({
  subject: email.Subject ?? undefined,
  to: email.Destination?.ToAddresses ?? [],
  html: email.Body?.html_part ?? undefined,
  text: email.Body?.text_part ?? undefined,
  headers: headersFromFields(email),
  attachments: [],
});

// Mail SendRawEmail không có Subject/Destination: phải đọc MIME mới có để hiện trong danh sách
export function needsMimeFields(email: Email): boolean {
  return Boolean(email.RawData) && !email.RejectReason && (!email.Subject || !email.Destination);
}

// Không ghi đè giá trị Floci đã trả: chỉ điền chỗ còn thiếu
export function withMimeFields(email: Email, fields: Pick<EmailContent, "subject" | "to">): Email {
  return {
    ...email,
    Subject: email.Subject || fields.subject,
    Destination:
      email.Destination ?? (fields.to.length ? { ToAddresses: fields.to } : email.Destination),
  };
}

export function rawText(rawData: string): string {
  try {
    return new TextDecoder().decode(fromBase64(rawData));
  } catch {
    // base64 sai: tab Raw vẫn hiện nguyên chuỗi (spec 5)
    return rawData;
  }
}
