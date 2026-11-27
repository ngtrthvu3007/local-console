import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

// Floci không đổi tài nguyên theo type nên chỉ cần vài mức
export const INSTANCE_TYPES = ["t3.micro", "t3.small", "t3.medium"] as const;
export const DEFAULT_INSTANCE_TYPE = INSTANCE_TYPES[0];
// AMI mặc định: Amazon Linux 2023 x86_64 trong catalog của Floci
export const DEFAULT_AMI_DESCRIPTION = "Amazon Linux 2023 AMI";
export const DEFAULT_AMI_ARCHITECTURE = "x86_64";

// Instance đang đổi trạng thái thì tự tải lại cho tới khi xong
export const INSTANCE_POLL_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;
export const USER_DATA_EDITOR_HEIGHT_PX = 200;
export const NAME_TAG_KEY = "Name";
export const STATE_FILTER_ALL = "all";

export const INSTANCE_STATES = {
  pending: "pending",
  running: "running",
  shuttingDown: "shutting-down",
  terminated: "terminated",
  stopping: "stopping",
  stopped: "stopped",
} as const;

interface StateStyle {
  label: string;
  type: StatusIndicatorProps.Type;
}

export const INSTANCE_STATE_STYLES: Record<string, StateStyle> = {
  pending: { label: "Pending", type: "pending" },
  running: { label: "Running", type: "success" },
  "shutting-down": { label: "Shutting down", type: "in-progress" },
  terminated: { label: "Terminated", type: "error" },
  stopping: { label: "Stopping", type: "in-progress" },
  stopped: { label: "Stopped", type: "stopped" },
};

// Shutting-down không có trong ô lọc: chỉ thoáng qua rồi thành Terminated
export const STATE_FILTER_OPTIONS = [
  { value: STATE_FILTER_ALL, label: "All states" },
  ...[
    INSTANCE_STATES.pending,
    INSTANCE_STATES.running,
    INSTANCE_STATES.stopping,
    INSTANCE_STATES.stopped,
    INSTANCE_STATES.terminated,
  ].map((state) => ({ value: state, label: INSTANCE_STATE_STYLES[state].label })),
];

export const TRANSITIONAL_STATES: string[] = [
  INSTANCE_STATES.pending,
  INSTANCE_STATES.stopping,
  INSTANCE_STATES.shuttingDown,
];

// Giới hạn của AWS: user data 16 KB (tính theo byte, trước khi base64), giá trị tag 256 ký tự
export const USER_DATA_MAX_BYTES = 16 * 1024;
export const NAME_MAX_LENGTH = 256;
