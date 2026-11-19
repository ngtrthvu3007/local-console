import Link from "@cloudscape-design/components/link";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { functionNameOfArn } from "../helpers.ts";
import { lambdaRoutes } from "../routes.ts";

// ARN function thành link sang trang function; dùng ở S3 (event notification)
export function FunctionLink({ arn }: { arn: string }) {
  const follow = useFollow();
  const name = functionNameOfArn(arn);
  return (
    <Link href={lambdaRoutes.function(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
