import Link from "@cloudscape-design/components/link";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { taskDefinitionLabel, taskDefinitionRefOf } from "../arns.ts";
import { ecsRoutes } from "../routes.ts";

// "family:revision" thành link sang trang revision
export function TaskDefinitionLink({ arn }: { arn?: string }) {
  const follow = useFollow();
  if (!arn) return <>{NOT_AVAILABLE}</>;

  const { family, revision } = taskDefinitionRefOf(arn);
  return (
    <Link href={ecsRoutes.revision(family, revision)} onFollow={follow}>
      {taskDefinitionLabel(arn)}
    </Link>
  );
}
