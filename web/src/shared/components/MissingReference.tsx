import StatusIndicator from "@cloudscape-design/components/status-indicator";

// Tham chiếu tới resource đã bị xóa (S3 rule, SNS subscription, trigger…). Không làm link vì
// trang đích chỉ báo "not found"
export function MissingReference({ name }: { name: string }) {
  return <StatusIndicator type='warning'>{name} (not found)</StatusIndicator>;
}
