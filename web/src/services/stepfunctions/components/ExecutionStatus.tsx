import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { STEP_STATUS_STYLES, type StepStatus } from "../constants.ts";

export function StepStatusIndicator({ status }: { status: StepStatus }) {
  const style = STEP_STATUS_STYLES[status];
  return <StatusIndicator type={style.type}>{style.label}</StatusIndicator>;
}
