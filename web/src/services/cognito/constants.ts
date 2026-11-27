import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

export const USER_STATUSES: Record<string, { label: string; type: StatusIndicatorProps.Type }> = {
  UNCONFIRMED: { label: "Unconfirmed", type: "pending" },
  CONFIRMED: { label: "Confirmed", type: "success" },
  FORCE_CHANGE_PASSWORD: { label: "Force change password", type: "pending" },
  RESET_REQUIRED: { label: "Reset required", type: "warning" },
  EXTERNAL_PROVIDER: { label: "External provider", type: "info" },
};
export const GROUP_GENERAL_COLUMNS = 3;
export const GROUP_MEMBERS_DESCRIPTION =
  "Members get this group in the cognito:groups claim of their tokens.";
export const CLIENT_GENERAL_COLUMNS = 3;
export const USER_PASSWORD_AUTH_ALERT =
  "Enable ALLOW_USER_PASSWORD_AUTH on this client to test sign-in.";
