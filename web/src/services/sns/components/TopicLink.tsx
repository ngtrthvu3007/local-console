import Link from "@cloudscape-design/components/link";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { snsRoutes } from "../routes.ts";

// Tên topic thành link sang trang topic; dùng ở S3, SQS, Lambda và chính SNS
export function TopicLink({ name }: { name: string }) {
  const follow = useFollow();
  return (
    <Link href={snsRoutes.topic(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
