import {
  paginateListStateMachines,
  type SFNClient,
  type StateMachineType,
} from "@aws-sdk/client-sfn";
import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";

const ARN_SEPARATOR = ":";
// "arn:aws:states:r:acct:execution:<state machine>:<name>" và Express
// "arn:aws:states:r:acct:express:<state machine>:<id>:<id>": tên state machine ở vị trí 6
const EXECUTION_ARN_MACHINE_INDEX = 6;

export interface StateMachine {
  name: string;
  arn: string;
  type: StateMachineType;
  createdAt?: Date;
}

export const stateMachineArn = (region: string, name: string) =>
  `arn:aws:states:${region}:${FLOCI_ACCOUNT_ID}:stateMachine:${name}`;

// "arn:aws:states:…:stateMachine:orders" → "orders"
export const stateMachineNameOfArn = (arn: string) => arn.split(ARN_SEPARATOR).pop() ?? arn;

export const stateMachineOfExecutionArn = (executionArn: string) =>
  executionArn.split(ARN_SEPARATOR)[EXECUTION_ARN_MACHINE_INDEX] ?? "";

export async function listStateMachines(client: SFNClient): Promise<StateMachine[]> {
  const machines: StateMachine[] = [];
  for await (const page of paginateListStateMachines({ client }, {})) {
    for (const item of page.stateMachines ?? []) {
      machines.push({
        name: item.name ?? "",
        arn: item.stateMachineArn ?? "",
        type: item.type ?? "STANDARD",
        createdAt: item.creationDate,
      });
    }
  }
  return machines;
}
