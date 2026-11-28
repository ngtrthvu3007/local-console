// Floci không đổi tài nguyên theo type nên chỉ cần vài mức
export const INSTANCE_TYPES = ["t3.micro", "t3.small", "t3.medium"] as const;
export const DEFAULT_INSTANCE_TYPE = INSTANCE_TYPES[0];
// AMI mặc định: Amazon Linux 2023 x86_64 trong catalog của Floci
export const DEFAULT_AMI_DESCRIPTION = "Amazon Linux 2023 AMI";
export const DEFAULT_AMI_ARCHITECTURE = "x86_64";

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

export const TRANSITIONAL_STATES: string[] = [
  INSTANCE_STATES.pending,
  INSTANCE_STATES.stopping,
  INSTANCE_STATES.shuttingDown,
];

// Giới hạn của AWS: user data 16 KB (tính theo byte, trước khi base64), giá trị tag 256 ký tự
export const USER_DATA_MAX_BYTES = 16 * 1024;
export const NAME_MAX_LENGTH = 256;
