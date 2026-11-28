import StatusIndicator, {
  type StatusIndicatorProps,
} from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "../constants.ts";

interface Props {
  status?: string;
  styles: Record<string, { label: string; type: StatusIndicatorProps.Type }>;
}

// Trạng thái theo bảng style của service (label + màu); trạng thái lạ hiện nguyên văn thay vì đoán
export function StatusBadge({ status, styles }: Props) {
  if (!status) return <>{NOT_AVAILABLE}</>;

  const style = styles[status];
  return <StatusIndicator type={style?.type ?? "info"}>{style?.label ?? status}</StatusIndicator>;
}
