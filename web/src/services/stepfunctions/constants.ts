import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import type { StepStatus } from "@localconsole/core/stepfunctions";

// Tải lại khi còn execution RUNNING
export const EXECUTION_POLL_INTERVAL_MS = 2000;
export const EDITOR_HEIGHT_PX = 200;
// Map / Parallel có nhiều con hơn mức này thì gập sẵn, khỏi vẽ hàng trăm dòng khi mở trang
export const COLLAPSE_CHILDREN_LIMIT = 20;
export const TRUNCATED_NOTE =
  "Step Functions cut this payload because it is too large (over 256 KB).";
export const STATUS_FILTER_ALL = "ALL";
export const STATE_MACHINE_TYPE_LABELS = { STANDARD: "Standard", EXPRESS: "Express" } as const;

interface StatusStyle {
  label: string;
  type: StatusIndicatorProps.Type;
}

export const EXECUTION_STATUS_STYLES: Record<string, StatusStyle> = {
  RUNNING: { label: "Running", type: "in-progress" },
  SUCCEEDED: { label: "Succeeded", type: "success" },
  FAILED: { label: "Failed", type: "error" },
  TIMED_OUT: { label: "Timed out", type: "error" },
  ABORTED: { label: "Aborted", type: "stopped" },
};
export const EXECUTION_STATUS_FILTERS = Object.entries(EXECUTION_STATUS_STYLES).map(
  ([value, { label }]) => ({ value, label }),
);

// Trạng thái một bước trong bảng Steps
export const STEP_STATUS_STYLES = {
  succeeded: EXECUTION_STATUS_STYLES.SUCCEEDED,
  caught: { label: "Caught error", type: "warning" },
  running: EXECUTION_STATUS_STYLES.RUNNING,
  failed: EXECUTION_STATUS_STYLES.FAILED,
  aborted: EXECUTION_STATUS_STYLES.ABORTED,
  timedOut: EXECUTION_STATUS_STYLES.TIMED_OUT,
} as const satisfies Record<StepStatus, StatusStyle>;
