import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import type { RevisionStatus } from "@localconsole/core/ecs";

interface StatusStyle {
  label: string;
  type: StatusIndicatorProps.Type;
}

const IN_PROGRESS: StatusIndicatorProps.Type = "in-progress";

export const TASK_STATUS_STYLES: Record<string, StatusStyle> = {
  PROVISIONING: { label: "Provisioning", type: IN_PROGRESS },
  PENDING: { label: "Pending", type: "pending" },
  ACTIVATING: { label: "Activating", type: IN_PROGRESS },
  RUNNING: { label: "Running", type: "success" },
  DEACTIVATING: { label: "Deactivating", type: IN_PROGRESS },
  STOPPING: { label: "Stopping", type: IN_PROGRESS },
  DEPROVISIONING: { label: "Deprovisioning", type: IN_PROGRESS },
  STOPPED: { label: "Stopped", type: "stopped" },
};

export const SERVICE_STATUS_STYLES: Record<string, StatusStyle> = {
  ACTIVE: { label: "Active", type: "success" },
  DRAINING: { label: "Draining", type: IN_PROGRESS },
  INACTIVE: { label: "Inactive", type: "stopped" },
};

export const REVISION_STATUS_STYLES = {
  ACTIVE: { label: "Active", type: "success" },
  INACTIVE: { label: "Inactive", type: "stopped" },
  // Floci giữ revision ở trạng thái này mãi sau DeleteTaskDefinitions (spec 7 #9)
  DELETE_IN_PROGRESS: { label: "Delete in progress", type: "pending" },
} satisfies Record<RevisionStatus, StatusStyle>;

// Floci không lưu task: restart là mất task chạy lẻ và lịch sử task đã dừng (spec 7 #12)
export const TASKS_NOT_KEPT = "Floci doesn't keep tasks across restarts.";
export const ROLLING_UPDATE_NOTE =
  "Floci starts new tasks before stopping old ones; running count settles after a few seconds.";
export const NO_AWSLOGS_TEXT = "This container doesn't send logs to CloudWatch Logs.";
