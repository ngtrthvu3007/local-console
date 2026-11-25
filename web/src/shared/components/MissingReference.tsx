import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useFollow } from "../hooks/useFollow.ts";

// Tham chiếu tới resource đã bị xóa (S3 rule, SNS subscription, trigger…). Không làm link vì
// trang đích chỉ báo "not found"
export function MissingReference({ name }: { name: string }) {
  return <StatusIndicator type='warning'>{name} (not found)</StatusIndicator>;
}

// Link sang resource của service khác; missing chỉ true khi đã dò xong và không thấy
export function ReferenceLink({
  name,
  href,
  missing,
}: {
  name: string;
  href: string;
  missing: boolean;
}) {
  const follow = useFollow();
  if (missing) return <MissingReference name={name} />;
  return (
    <Link href={href} onFollow={follow}>
      {name}
    </Link>
  );
}
