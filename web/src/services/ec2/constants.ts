import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { MILLISECONDS_PER_SECOND } from "@localconsole/core/shared";
import { INSTANCE_STATES, STATE_FILTER_ALL } from "@localconsole/core/ec2";

// Instance đang đổi trạng thái thì tự tải lại cho tới khi xong
export const INSTANCE_POLL_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;
export const USER_DATA_EDITOR_HEIGHT_PX = 200;
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
