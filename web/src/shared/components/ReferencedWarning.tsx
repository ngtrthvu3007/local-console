import Alert from "@cloudscape-design/components/alert";
import { LIST_SEPARATOR } from "../constants.ts";

// Cảnh báo khi xóa resource đang được SNS subscription, S3 notification, rule hoặc schedule EventBridge trỏ tới
export function ReferencedWarning({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <Alert type='warning'>
      SNS subscriptions, S3 notifications, EventBridge rules or schedules still point at{" "}
      {names.join(LIST_SEPARATOR)}. They stay in place but show as not found.
    </Alert>
  );
}
