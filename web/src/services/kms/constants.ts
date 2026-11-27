import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

// Hằng không dính UI nằm ở core (MCP dùng chung); file này giữ phần hiển thị

interface StateStyle {
  label: string;
  type: StatusIndicatorProps.Type;
}

export const KEY_STATE_STYLES: Record<string, StateStyle> = {
  Enabled: { label: "Enabled", type: "success" },
  Disabled: { label: "Disabled", type: "stopped" },
  PendingDeletion: { label: "Pending deletion", type: "pending" },
};
export const OTHER_STATE_TYPE: StatusIndicatorProps.Type = "in-progress";
