import {
  DescribeStateMachineCommand,
  paginateListStateMachines,
  StateMachineDoesNotExist,
  type SFNClient,
} from "@aws-sdk/client-sfn";
import { isNotFoundError } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";
import {
  stateMachineArn,
  type StateMachine,
  type StateMachineDetails,
} from "#services/stepfunctions/stateMachines.ts";

export const isStateMachineMissing = (error: unknown) =>
  error instanceof StateMachineDoesNotExist || isNotFoundError(error);

export async function listStateMachines(sfn: SFNClient): Promise<StateMachine[]> {
  const items = await collectPages(
    paginateListStateMachines({ client: sfn }, {}),
    (page) => page.stateMachines,
  );

  return items.map((item) => ({
    name: item.name ?? "",
    arn: item.stateMachineArn ?? "",
    type: item.type ?? "STANDARD",
    createdAt: item.creationDate,
  }));
}

export async function getStateMachine(
  sfn: SFNClient,
  region: string,
  name: string,
): Promise<StateMachineDetails> {
  const arn = stateMachineArn(region, name);
  const machine = await sfn.send(new DescribeStateMachineCommand({ stateMachineArn: arn }));
  return {
    name: machine.name ?? "",
    arn,
    type: machine.type ?? "STANDARD",
    createdAt: machine.creationDate,
    definition: machine.definition ?? "",
  };
}
