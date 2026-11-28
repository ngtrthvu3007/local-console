import type { StateMachineType } from "@aws-sdk/client-sfn";
import { ARN_SEPARATOR } from "#shared/utils/arn.ts";
import { FLOCI_ACCOUNT_ID } from "#shared/constants.ts";

// …:execution:<state machine>:<name>, Express …:express:<state machine>:<id>:<id> → tên ở vị trí 6
const EXECUTION_ARN_MACHINE_INDEX = 6;

export interface StateMachine {
  name: string;
  arn: string;
  type: StateMachineType;
  createdAt?: Date;
}

export const stateMachineArn = (region: string, name: string) =>
  `arn:aws:states:${region}:${FLOCI_ACCOUNT_ID}:stateMachine:${name}`;

export const stateMachineOfExecutionArn = (executionArn: string) =>
  executionArn.split(ARN_SEPARATOR)[EXECUTION_ARN_MACHINE_INDEX] ?? "";

export interface StateMachineDetails extends StateMachine {
  definition: string;
}
