import Alert from "@cloudscape-design/components/alert";

const LIST_SEPARATOR = ", ";

// Cảnh báo khi xóa resource đang được SNS subscription / S3 notification trỏ tới
export function ReferencedWarning({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <Alert type='warning'>
      SNS subscriptions or S3 notifications still point at {names.join(LIST_SEPARATOR)}. They stay
      in place but show as not found.
    </Alert>
  );
}
