import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useTopicExists } from "../hooks/useTopics.ts";
import { snsRoutes } from "../routes.ts";

// Tên topic thành link sang trang topic; dùng ở S3, SQS, Lambda và chính SNS
export function TopicLink({ name }: { name: string }) {
  const exists = useTopicExists(name).data;
  return <ReferenceLink name={name} href={snsRoutes.topic(name)} missing={exists === false} />;
}
