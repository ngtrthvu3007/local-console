import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { STREAM_STATUS_STYLES } from "../constants.ts";

export function StreamStatus({ status }: { status?: string }) {
  if (!status) return <>{NOT_AVAILABLE}</>;
  const style = STREAM_STATUS_STYLES[status];
  // Trạng thái lạ: hiện nguyên văn thay vì đoán
  return <StatusIndicator type={style?.type ?? "info"}>{style?.label ?? status}</StatusIndicator>;
}
