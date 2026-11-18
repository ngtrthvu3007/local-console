import Link from "@cloudscape-design/components/link";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { sqsRoutes } from "../routes.ts";

// Tên queue thành link sang trang queue; dùng ở Lambda, S3 và chính SQS
export function QueueLink({ name }: { name: string }) {
  const follow = useFollow();
  return (
    <Link href={sqsRoutes.queue(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
