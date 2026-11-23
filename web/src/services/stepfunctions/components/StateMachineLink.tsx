import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useStateMachineExists } from "../hooks/useStateMachines.ts";
import { stepfunctionsRoutes } from "../routes.ts";

// Tên state machine thành link sang trang state machine; dùng ở EventBridge, bước Task lồng nhau
// và chính Step Functions
export function StateMachineLink({ name }: { name: string }) {
  const follow = useFollow();
  const exists = useStateMachineExists(name).data;
  if (exists === false) return <MissingReference name={name} />;
  return (
    <Link href={stepfunctionsRoutes.stateMachine(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
