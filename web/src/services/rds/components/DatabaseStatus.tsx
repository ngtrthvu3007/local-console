import type { DBInstance } from "@aws-sdk/client-rds";
import StatusIndicator, {
  type StatusIndicatorProps,
} from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { DB_STATUSES, FAILED_STATUSES, statusLabel } from "@localconsole/core/rds";

function indicatorType(status: string): StatusIndicatorProps.Type {
  if (status === DB_STATUSES.available) return "success";
  if (status === DB_STATUSES.stopped) return "stopped";
  return FAILED_STATUSES.includes(status) ? "error" : "in-progress";
}

export function DatabaseStatus({ database }: { database: DBInstance }) {
  const status = database.DBInstanceStatus;
  if (!status) return <>{NOT_AVAILABLE}</>;
  return <StatusIndicator type={indicatorType(status)}>{statusLabel(status)}</StatusIndicator>;
}
