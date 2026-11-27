import {
  GetExecutionHistoryCommand,
  ListExecutionsCommand,
  DescribeExecutionCommand,
  ExecutionDoesNotExist,
  StartExecutionCommand,
  StopExecutionCommand,
  type ExecutionStatus,
  type SFNClient,
} from "@aws-sdk/client-sfn";
import { isNotFoundError } from "#shared/aws/errors.ts";
import { allPages } from "#shared/aws/pagination.ts";

export interface StartExecutionInput {
  name: string;
  input: string;
}

export const isExecutionMissing = (error: unknown) =>
  error instanceof ExecutionDoesNotExist || isNotFoundError(error);

// statusFilter rỗng = mọi trạng thái
export const listExecutions = (
  sfn: SFNClient,
  machineArn: string,
  statusFilter: ExecutionStatus | "",
) =>
  allPages(async (nextToken) => {
    const page = await sfn.send(
      new ListExecutionsCommand({
        stateMachineArn: machineArn,
        statusFilter: statusFilter || undefined,
        nextToken,
      }),
    );
    return { items: page.executions ?? [], nextToken: page.nextToken };
  });

export const getExecution = (sfn: SFNClient, arn: string) =>
  sfn.send(new DescribeExecutionCommand({ executionArn: arn }));

export const getExecutionHistory = (sfn: SFNClient, arn: string) =>
  allPages(async (nextToken) => {
    const page = await sfn.send(new GetExecutionHistoryCommand({ executionArn: arn, nextToken }));
    return { items: page.events ?? [], nextToken: page.nextToken };
  });

export const startExecution = async (
  sfn: SFNClient,
  machineArn: string,
  { name, input }: StartExecutionInput,
) =>
  (
    await sfn.send(
      new StartExecutionCommand({ stateMachineArn: machineArn, name: name || undefined, input }),
    )
  ).executionArn ?? "";

export const stopExecution = (sfn: SFNClient, arn: string) =>
  sfn.send(new StopExecutionCommand({ executionArn: arn }));
