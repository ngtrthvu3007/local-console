import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useQueueExists } from "../hooks/useQueues.ts";
import { sqsRoutes } from "../routes.ts";

// Tên queue thành link sang trang queue; dùng ở Lambda, S3, SNS và chính SQS
export function QueueLink({ name }: { name: string }) {
  const follow = useFollow();
  const exists = useQueueExists(name).data;
  if (exists === false) return <MissingReference name={name} />;
  return (
    <Link href={sqsRoutes.queue(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
