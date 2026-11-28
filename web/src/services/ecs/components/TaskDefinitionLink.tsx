import Link from "@cloudscape-design/components/link";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { taskDefinitionLabel, taskDefinitionRefOf, ecsRoutes } from "@localconsole/core/ecs";

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
