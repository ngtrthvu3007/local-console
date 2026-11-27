import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

export const STREAM_MODES = { ON_DEMAND: "On-demand", PROVISIONED: "Provisioned" } as const;
type StreamMode = keyof typeof STREAM_MODES;
// Mặc định giống AWS Console
export const DEFAULT_STREAM_MODE: StreamMode = "ON_DEMAND";

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

// 3 kiểu Data viewer của AWS hay dùng; AT/AFTER_SEQUENCE_NUMBER để sau
export const ITERATOR_TYPES = {
  TRIM_HORIZON: "Trim horizon",
  LATEST: "Latest",
  AT_TIMESTAMP: "At timestamp",
} as const;
type IteratorType = keyof typeof ITERATOR_TYPES;
export const DEFAULT_ITERATOR_TYPE: IteratorType = "TRIM_HORIZON";

export const RECORDS_PAGE_SIZE = 50;

// Luật tên của AWS; Floci nhận cả tên sai nên console tự kiểm
export const STREAM_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,128}$/;
export const STREAM_NAME_MAX_LENGTH = 128;
export const SHARD_COUNT = { min: 1, default: 1 } as const;
export const PARTITION_KEY_MAX_LENGTH = 256;
// Floci trả MaxRecordSizeInKiB; thiếu thì dùng giới hạn mặc định 1 MiB của AWS
export const DEFAULT_MAX_RECORD_KIB = 1024;
