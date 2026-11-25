import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useQueueExists } from "../hooks/useQueues.ts";
import { sqsRoutes } from "../routes.ts";

// Tên queue thành link sang trang queue; dùng ở Lambda, S3, SNS và chính SQS
export function QueueLink({ name }: { name: string }) {
  const exists = useQueueExists(name).data;
  return <ReferenceLink name={name} href={sqsRoutes.queue(name)} missing={exists === false} />;
}
