import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { BROKER_RUNNING, FAILED_STATES } from "../constants.ts";

// Chỉ hiện khi khác RUNNING: tô xanh mọi dòng chỉ gây nhiễu
export function BrokerStatus({ state }: { state?: string }) {
  if (!state || state === BROKER_RUNNING) return null;
  return (
    <StatusIndicator type={FAILED_STATES.includes(state) ? "error" : "in-progress"}>
      {state}
    </StatusIndicator>
  );
}
