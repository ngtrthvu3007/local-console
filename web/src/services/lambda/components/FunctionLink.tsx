import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { functionNameOfArn } from "../helpers.ts";
import { useFunctionExists } from "../hooks/useFunctions.ts";
import { lambdaRoutes } from "../routes.ts";

// ARN function thành link sang trang function; dùng ở S3 (event notification) và SNS (subscription)
export function FunctionLink({ arn }: { arn: string }) {
  const follow = useFollow();
  const name = functionNameOfArn(arn);
  const exists = useFunctionExists(name).data;
  if (exists === false) return <MissingReference name={name} />;
  return (
    <Link href={lambdaRoutes.function(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
