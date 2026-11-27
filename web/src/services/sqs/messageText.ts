import type { Message } from "@aws-sdk/client-sqs";
import { formatDate, truncate } from "@shared/format.ts";
import { reformatJson } from "@shared/json.ts";
import { BODY_PREVIEW_LENGTH, MESSAGE_ATTRIBUTES, MESSAGE_ID_PREVIEW_LENGTH } from "./constants.ts";

// System attribute thời gian của SQS là epoch mili giây: SentTimestamp, ApproximateFirstReceiveTimestamp
const TIMESTAMP_ATTRIBUTE_SUFFIX = "Timestamp";
const WHITESPACE_RUN = /\s+/g;

export const messageIdPreview = (message: Message) =>
  truncate(message.MessageId ?? "", MESSAGE_ID_PREVIEW_LENGTH);

// Một dòng trong bảng: gộp khoảng trắng để JSON nhiều dòng vẫn đọc được
export const bodyPreview = (message: Message) =>
  truncate((message.Body ?? "").replace(WHITESPACE_RUN, " "), BODY_PREVIEW_LENGTH);

// Chỉ xem nên format JSON cho dễ đọc, không đổi dữ liệu
export const bodyText = (message: Message) => reformatJson(message.Body ?? "");

export const receiveCountOf = (message: Message) =>
  Number(message.Attributes?.[MESSAGE_ATTRIBUTES.receiveCount] ?? 0);

export const sentText = (message: Message) => {
  const sent = message.Attributes?.[MESSAGE_ATTRIBUTES.sent];
  return formatDate(sent ? Number(sent) : undefined);
};

// Message attribute do app gắn: chỉ hiện giá trị dạng chuỗi/số, binary ghi kiểu dữ liệu
export const messageAttributeText = (value: { StringValue?: string; DataType?: string }) =>
  value.StringValue ?? value.DataType ?? "";

// Panel chi tiết: thời gian đọc được như cột Sent, còn lại giữ nguyên giá trị SQS trả
export const systemAttributeText = (name: string, value: string) =>
  name.endsWith(TIMESTAMP_ATTRIBUTE_SUFFIX) ? formatDate(Number(value)) : value;
