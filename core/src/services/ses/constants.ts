import type { IdentityType } from "@aws-sdk/client-sesv2";
import { MILLISECONDS_PER_SECOND } from "#shared/constants.ts";

export const MAILBOX_ID_PARAM = "id";
export const MAILBOX_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

export const UNNAMED_ATTACHMENT = "attachment";
export const ADDRESS_SEPARATOR = ", ";

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  EMAIL_ADDRESS: "Email",
  DOMAIN: "Domain",
  MANAGED_DOMAIN: "Managed domain",
};

export const NO_SUBJECT = "(no subject)";

// Luật tên configuration set và tên destination của AWS
export const CONFIGURATION_SET_NAME_MAX_LENGTH = 64;
export const CONFIGURATION_SET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

// Bốn loại event Floci phát; loại khác (Reject…) tạo ngoài console vẫn hiện, chỉ không chọn được
export const EVENT_TYPE_LABELS = {
  SEND: "Send",
  DELIVERY: "Delivery",
  BOUNCE: "Bounce",
  COMPLAINT: "Complaint",
} as const;

export type AddableEventType = keyof typeof EVENT_TYPE_LABELS;

export const DESTINATION_KIND_LABELS = { sns: "SNS topic", eventbus: "Event bus" } as const;
export type DestinationKind = keyof typeof DESTINATION_KIND_LABELS;

// Địa chỉ giả lập của SES: gửi tới đây để nhận đúng loại event
export const SIMULATOR_HINTS = [
  { address: "success@simulator.amazonses.com", event: "Delivery" },
  { address: "bounce@simulator.amazonses.com", event: "Bounce" },
  { address: "complaint@simulator.amazonses.com", event: "Complaint" },
] as const;
