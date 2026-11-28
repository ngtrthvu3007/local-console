import type { Message } from "@aws-sdk/client-sqs";
import { formatDate, truncate } from "#shared/utils/format.ts";
import { reformatJson } from "#shared/utils/json.ts";
import { BODY_PREVIEW_LENGTH, MESSAGE_ATTRIBUTES, MESSAGE_ID_PREVIEW_LENGTH } from "./constants.ts";

// System attribute thời gian của SQS là epoch mili giây: SentTimestamp, ApproximateFirstReceiveTimestamp
const TIMESTAMP_ATTRIBUTE_SUFFIX = "Timestamp";
const WHITESPACE_RUN = /\s+/g;

export const messageIdPreview = (message: Message) =>
  truncate(message.MessageId ?? "", MESSAGE_ID_PREVIEW_LENGTH);

export const bodyPreview = (message: Message) =>
  truncate((message.Body ?? "").replace(WHITESPACE_RUN, " "), BODY_PREVIEW_LENGTH);

export const bodyText = (message: Message) => reformatJson(message.Body ?? "");

export const receiveCountOf = (message: Message) =>
  Number(message.Attributes?.[MESSAGE_ATTRIBUTES.receiveCount] ?? 0);

export const sentText = (message: Message) => {
  const sent = message.Attributes?.[MESSAGE_ATTRIBUTES.sent];
  return formatDate(sent ? Number(sent) : undefined);
};

export const messageAttributeText = (value: { StringValue?: string; DataType?: string }) =>
  value.StringValue ?? value.DataType ?? "";

export const systemAttributeText = (name: string, value: string) =>
  name.endsWith(TIMESTAMP_ATTRIBUTE_SUFFIX) ? formatDate(Number(value)) : value;
