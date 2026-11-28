import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import type { VerificationStatus } from "@aws-sdk/client-sesv2";

export const HTML_PREVIEW_HEIGHT = "70vh";
export const HTML_PREVIEW_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export const HTML_PREVIEW_BASE = '<base target="_blank">';
export const HTML_PREVIEW_BACKGROUND = "#ffffff";

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
