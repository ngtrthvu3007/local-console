import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { CLUSTER_STATUS_AVAILABLE, FAILED_STATUSES } from "../constants.ts";

// Chỉ hiện khi khác "available": tô xanh mọi dòng chỉ gây nhiễu
export function ClusterStatus({ status }: { status?: string }) {
  if (!status || status === CLUSTER_STATUS_AVAILABLE) return null;
  return (
    <StatusIndicator type={FAILED_STATUSES.includes(status) ? "error" : "in-progress"}>
      {status}
    </StatusIndicator>
  );
}
