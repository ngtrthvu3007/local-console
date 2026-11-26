import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

// Console chỉ chạy Fargate (spec 2: EC2 launch type để sau)
export const LAUNCH_TYPE = "FARGATE" as const;

// Luật tên của AWS cho cluster, service, family task definition
export const RESOURCE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;
export const RESOURCE_NAME_RULE = "Use 1–255 letters, numbers, hyphens (-) or underscores (_).";

// RunTask của AWS chạy tối đa 10 task một lần
export const TASK_COUNT = { min: 1, max: 10, default: 1 } as const;
// Desired count của service: AWS không giới hạn trên, form chặn ở mức hợp lý cho máy dev
export const DESIRED_COUNT = { min: 0, max: 100, default: 1 } as const;

// Giới hạn số tên mỗi lần gọi Describe* của AWS
export const DESCRIBE_BATCH = { clusters: 100, tasks: 100, services: 10 } as const;

export const DESIRED_STATUSES = { RUNNING: "Running", STOPPED: "Stopped" } as const;
export type DesiredStatus = keyof typeof DESIRED_STATUSES;

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

// Trạng thái ECS hay so sánh: cluster / service / revision (ACTIVE, INACTIVE), task (RUNNING, STOPPED).
// Cluster / service đã xóa vẫn trả về một lúc với INACTIVE
export const STATUS = {
  active: "ACTIVE",
  inactive: "INACTIVE",
  running: "RUNNING",
  stopped: "STOPPED",
} as const;

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
} satisfies Record<string, StatusStyle>;
export type RevisionStatus = keyof typeof REVISION_STATUS_STYLES;

export const AWSLOGS_DRIVER = "awslogs";
export const AWSLOGS_OPTIONS = {
  group: "awslogs-group",
  region: "awslogs-region",
  streamPrefix: "awslogs-stream-prefix",
} as const;

export const STOP_REASON = "Stopped from Local Console";
// Floci không lưu task: restart là mất task chạy lẻ và lịch sử task đã dừng (spec 7 #12)
export const TASKS_NOT_KEPT = "Floci doesn't keep tasks across restarts.";
export const ROLLING_UPDATE_NOTE =
  "Floci starts new tasks before stopping old ones; running count settles after a few seconds.";
export const NO_AWSLOGS_TEXT = "This container doesn't send logs to CloudWatch Logs.";
