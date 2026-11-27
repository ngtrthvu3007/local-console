import type { ExecutionStatus, SFNClient } from "@aws-sdk/client-sfn";
import {
  getExecution,
  getExecutionHistory,
  listExecutions,
  startExecution,
  stopExecution,
  type StartExecutionInput,
} from "./operations/executions.ts";
import { getStateMachine, listStateMachines } from "./operations/stateMachines.ts";

interface StepFunctionsDeps {
  region: string;
}

export function createStepFunctionsService(sfn: SFNClient, { region }: StepFunctionsDeps) {
  return {
    listStateMachines: () => listStateMachines(sfn),
    getStateMachine: (name: string) => getStateMachine(sfn, region, name),
    listExecutions: (machineArn: string, statusFilter: ExecutionStatus | "") =>
      listExecutions(sfn, machineArn, statusFilter),
    getExecution: (arn: string) => getExecution(sfn, arn),
    getExecutionHistory: (arn: string) => getExecutionHistory(sfn, arn),
    startExecution: (machineArn: string, input: StartExecutionInput) =>
      startExecution(sfn, machineArn, input),
    stopExecution: (arn: string) => stopExecution(sfn, arn),
  };
}

export type StepFunctionsService = ReturnType<typeof createStepFunctionsService>;
