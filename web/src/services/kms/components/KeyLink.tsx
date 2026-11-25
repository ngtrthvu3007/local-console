import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useKeyExists } from "../hooks/useKeys.ts";
import { keyLabel } from "../keys.ts";
import { kmsRoutes } from "../routes.ts";

// Key mà service khác lưu (ID, ARN, alias hoặc ARN alias) thành link sang trang key, như QueueLink.
// Dùng ở Secrets Manager, SSM, S3, SQS, SNS, DynamoDB, Lambda, RDS
export function KeyLink({ value }: { value: string }) {
  const follow = useFollow();
  const exists = useKeyExists(value).data;
  const label = keyLabel(value);
  if (exists === false) return <MissingReference name={label} />;
  return (
    <Link href={kmsRoutes.key(value)} onFollow={follow}>
      {label}
    </Link>
  );
}
