import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import type { IdentityType, VerificationStatus } from "@aws-sdk/client-sesv2";
import { AWS_PROXY_PATH, MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

export const MAILBOX_PATH = `${AWS_PROXY_PATH}/_aws/ses`;
export const MAILBOX_ID_PARAM = "id";
export const MAILBOX_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

export const HTML_PREVIEW_HEIGHT = "70vh";
export const HTML_PREVIEW_SANDBOX =
  "allow-popups allow-popups-to-escape-sandbox";
export const HTML_PREVIEW_BASE = '<base target="_blank">';
export const HTML_PREVIEW_BACKGROUND = "#ffffff";

export const UNNAMED_ATTACHMENT = "attachment";
export const ADDRESS_SEPARATOR = ", ";

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  EMAIL_ADDRESS: "Email",
  DOMAIN: "Domain",
  MANAGED_DOMAIN: "Managed domain",
};

export const VERIFICATION_STATUS: Record<
  VerificationStatus,
  { type: StatusIndicatorProps.Type; label: string }
> = {
  SUCCESS: { type: "success", label: "Verified" },
  PENDING: { type: "pending", label: "Pending" },
  FAILED: { type: "error", label: "Failed" },
  TEMPORARY_FAILURE: { type: "warning", label: "Temporary failure" },
  NOT_STARTED: { type: "stopped", label: "Not started" },
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
