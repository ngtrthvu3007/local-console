import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useFollow } from "../hooks/useFollow.ts";

// Link sang resource của service khác; missing chỉ true khi đã dò xong và không thấy. Resource đã
// bị xóa thì không làm link vì trang đích chỉ báo "not found"
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
  if (missing) return <StatusIndicator type='warning'>{name} (not found)</StatusIndicator>;
  return (
    <Link href={href} onFollow={follow}>
      {name}
    </Link>
  );
}
