import Link from "@cloudscape-design/components/link";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { logsRoutes } from "../routes.ts";

// Link từ trang của service khác sang CloudWatch Logs; không hỏi trước group có tồn tại không,
// group chưa có thì trang Logs tự báo not found (spec 3.8)
export function LogGroupLink({ name }: { name: string }) {
  const follow = useFollow();
  return (
    <Link href={logsRoutes.group(name)} onFollow={follow}>
      {name}
    </Link>
  );
}

export function ViewInLogsLink({ href }: { href: string }) {
  const follow = useFollow();
  return (
    <Link href={href} onFollow={follow}>
      View in CloudWatch Logs
    </Link>
  );
}
