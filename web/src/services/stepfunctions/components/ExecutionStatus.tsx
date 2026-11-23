import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { EXECUTION_STATUS_STYLES, STEP_STATUS_STYLES, type StepStatus } from "../constants.ts";

// Status không biết (Floci thêm kiểu mới) thì hiện nguyên chữ
export function ExecutionStatus({ status }: { status?: string }) {
  const style = EXECUTION_STATUS_STYLES[status ?? ""];
  return <StatusIndicator type={style?.type ?? "info"}>{style?.label ?? status}</StatusIndicator>;
}

export function StepStatusIndicator({ status }: { status: StepStatus }) {
  const style = STEP_STATUS_STYLES[status];
  return <StatusIndicator type={style.type}>{style.label}</StatusIndicator>;
}
