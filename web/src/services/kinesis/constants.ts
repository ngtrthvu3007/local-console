import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

interface StatusStyle {
  label: string;
  type: StatusIndicatorProps.Type;
}

export const STREAM_STATUS_STYLES: Record<string, StatusStyle> = {
  CREATING: { label: "Creating", type: "in-progress" },
  ACTIVE: { label: "Active", type: "success" },
  UPDATING: { label: "Updating", type: "in-progress" },
  DELETING: { label: "Deleting", type: "pending" },
};
