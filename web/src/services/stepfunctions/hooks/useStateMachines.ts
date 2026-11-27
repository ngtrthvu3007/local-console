import { useQuery } from "@tanstack/react-query";
import { isStateMachineMissing } from "@localconsole/core/stepfunctions";
import { existsQuery } from "@shared/aws.ts";
import { useStepFunctionsService } from "./useStepFunctionsService.ts";

// Mọi query của Step Functions nằm dưới key gốc này
export const STEPFUNCTIONS_QUERY_ROOT = "stepfunctions";
const stateMachinesQueryKey = [STEPFUNCTIONS_QUERY_ROOT, "state-machines"];
const stateMachineQueryKey = (name: string, part?: string) =>
  part
    ? [STEPFUNCTIONS_QUERY_ROOT, "state-machine", name, part]
    : [STEPFUNCTIONS_QUERY_ROOT, "state-machine", name];

export function useStateMachines() {
  const sfn = useStepFunctionsService();

  return useQuery({ queryKey: stateMachinesQueryKey, queryFn: sfn.listStateMachines });
}

export function useStateMachine(name: string) {
  const sfn = useStepFunctionsService();

  return useQuery({
    queryKey: stateMachineQueryKey(name),
    queryFn: () => sfn.getStateMachine(name),
    retry: false,
  });
}

// Nơi khác tham chiếu tới state machine (bước Task, target EventBridge) còn trỏ được không
export function useStateMachineExists(name: string) {
  const sfn = useStepFunctionsService();

  return useQuery(
    existsQuery(
      stateMachineQueryKey(name, "exists"),
      () => sfn.getStateMachine(name),
      isStateMachineMissing,
    ),
  );
}
