import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useKeyExists } from "../hooks/useKeys.ts";
import { keyLabel, kmsRoutes } from "@localconsole/core/kms";

// Key mà service khác lưu (ID, ARN, alias hoặc ARN alias) thành link sang trang key, như QueueLink.
// Dùng ở Secrets Manager, SSM, S3, SQS, SNS, DynamoDB, Lambda, RDS
export function KeyLink({ value }: { value: string }) {
  const exists = useKeyExists(value).data;
  return (
    <ReferenceLink name={keyLabel(value)} href={kmsRoutes.key(value)} missing={exists === false} />
  );
}
