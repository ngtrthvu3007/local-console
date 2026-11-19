import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useTopicExists } from "../hooks/useTopics.ts";
import { snsRoutes } from "../routes.ts";

// Tên topic thành link sang trang topic; dùng ở S3, SQS, Lambda và chính SNS
export function TopicLink({ name }: { name: string }) {
  const follow = useFollow();
  const exists = useTopicExists(name).data;
  if (exists === false) return <MissingReference name={name} />;
  return (
    <Link href={snsRoutes.topic(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
