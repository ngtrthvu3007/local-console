import { useQuery } from "@tanstack/react-query";
import {
  DescribeStateMachineCommand,
  StateMachineDoesNotExist,
  type SFNClient,
} from "@aws-sdk/client-sfn";
import { existsUnlessMissing, isNotFoundError } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { listStateMachines, stateMachineArn, type StateMachine } from "../stateMachines.ts";
import { useSFN } from "./useSFN.ts";

// Mọi query của Step Functions nằm dưới key gốc này
export const STEPFUNCTIONS_QUERY_ROOT = "stepfunctions";
const stateMachinesQueryKey = [STEPFUNCTIONS_QUERY_ROOT, "state-machines"];
const stateMachineQueryKey = (name: string, part?: string) =>
  part
    ? [STEPFUNCTIONS_QUERY_ROOT, "state-machine", name, part]
    : [STEPFUNCTIONS_QUERY_ROOT, "state-machine", name];

export const isStateMachineMissing = (error: unknown) =>
  error instanceof StateMachineDoesNotExist || isNotFoundError(error);

export function useStateMachines() {
  const client = useSFN();
  return useQuery({
    queryKey: stateMachinesQueryKey,
    queryFn: () => listStateMachines(client),
  });
}

export interface StateMachineDetails extends StateMachine {
  definition: string;
}

async function describeStateMachine(client: SFNClient, arn: string): Promise<StateMachineDetails> {
  const machine = await client.send(new DescribeStateMachineCommand({ stateMachineArn: arn }));
  return {
    name: machine.name ?? "",
    arn,
    type: machine.type ?? "STANDARD",
    createdAt: machine.creationDate,
    definition: machine.definition ?? "",
  };
}

export function useStateMachine(name: string) {
  const client = useSFN();
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: stateMachineQueryKey(name),
    queryFn: () => describeStateMachine(client, stateMachineArn(region, name)),
    retry: false,
  });
}

// Nơi khác tham chiếu tới state machine (bước Task, target EventBridge) còn trỏ được không
export function useStateMachineExists(name: string) {
  const client = useSFN();
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: stateMachineQueryKey(name, "exists"),
    queryFn: () =>
      existsUnlessMissing(
        () =>
          client.send(
            new DescribeStateMachineCommand({ stateMachineArn: stateMachineArn(region, name) }),
          ),
        isStateMachineMissing,
      ),
    retry: false,
  });
}
