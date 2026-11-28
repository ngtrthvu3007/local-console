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

// Trạng thái ECS hay so sánh: cluster / service / revision (ACTIVE, INACTIVE), task (RUNNING, STOPPED).
// Cluster / service đã xóa vẫn trả về một lúc với INACTIVE
export const STATUS = {
  active: "ACTIVE",
  inactive: "INACTIVE",
  running: "RUNNING",
  stopped: "STOPPED",
} as const;

export const REVISION_STATUSES = ["ACTIVE", "INACTIVE", "DELETE_IN_PROGRESS"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const AWSLOGS_DRIVER = "awslogs";
export const AWSLOGS_OPTIONS = {
  group: "awslogs-group",
  region: "awslogs-region",
  streamPrefix: "awslogs-stream-prefix",
} as const;

export const STOP_REASON = "Stopped from Local Console";
