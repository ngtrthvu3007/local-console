import {
  paginateGetExecutionHistory,
  paginateListExecutions,
  DescribeExecutionCommand,
  ExecutionDoesNotExist,
  StartExecutionCommand,
  StopExecutionCommand,
  type ExecutionStatus,
  type SFNClient,
} from "@aws-sdk/client-sfn";
import { isNotFoundError } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";

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
  collectPages(
    paginateListExecutions(
      { client: sfn },
      { stateMachineArn: machineArn, statusFilter: statusFilter || undefined },
    ),
    (page) => page.executions,
  );

export const getExecution = (sfn: SFNClient, arn: string) =>
  sfn.send(new DescribeExecutionCommand({ executionArn: arn }));

export const getExecutionHistory = (sfn: SFNClient, arn: string) =>
  collectPages(
    paginateGetExecutionHistory({ client: sfn }, { executionArn: arn }),
    (page) => page.events,
  );

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
