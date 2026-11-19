import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import type { IdentityType, VerificationStatus } from "@aws-sdk/client-sesv2";
import { AWS_PROXY_PATH, MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

export const MAILBOX_PATH = `${AWS_PROXY_PATH}/_aws/ses`;
export const MAILBOX_ID_PARAM = "id";
export const MAILBOX_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

export const HTML_PREVIEW_HEIGHT = "70vh";
export const HTML_PREVIEW_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export const HTML_PREVIEW_BASE = '<base target="_blank">';

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
