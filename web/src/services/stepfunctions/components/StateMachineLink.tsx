import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useStateMachineExists } from "../hooks/useStateMachines.ts";
import { stepfunctionsRoutes } from "@localconsole/core/stepfunctions";

// Tên state machine thành link sang trang state machine; dùng ở EventBridge, bước Task lồng nhau
// và chính Step Functions
export function StateMachineLink({ name }: { name: string }) {
  const exists = useStateMachineExists(name).data;
  return (
    <ReferenceLink
      name={name}
      href={stepfunctionsRoutes.stateMachine(name)}
      missing={exists === false}
    />
  );
}
