import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeExecutionCommand,
  ExecutionDoesNotExist,
  GetExecutionHistoryCommand,
  ListExecutionsCommand,
  StartExecutionCommand,
  StopExecutionCommand,
  type ExecutionStatus,
} from "@aws-sdk/client-sfn";
import { allPages, isNotFoundError } from "@shared/aws.ts";
import { EXECUTION_POLL_INTERVAL_MS, RUNNING_STATUS } from "../constants.ts";
import { STEPFUNCTIONS_QUERY_ROOT } from "./useStateMachines.ts";
import { useSFN } from "./useSFN.ts";

const executionsQueryKey = (machineArn: string, status: string) => [
  STEPFUNCTIONS_QUERY_ROOT,
  "executions",
  machineArn,
  status,
];
const executionQueryKey = (arn: string, part: string) => [
  STEPFUNCTIONS_QUERY_ROOT,
  "execution",
  arn,
  part,
];

export const isExecutionMissing = (error: unknown) =>
  error instanceof ExecutionDoesNotExist || isNotFoundError(error);

// Còn execution chạy dở thì hỏi lại đều, hết thì thôi
const pollWhile = (running: boolean | undefined) => (running ? EXECUTION_POLL_INTERVAL_MS : false);

export function useExecutionList(machineArn: string, statusFilter: ExecutionStatus | "") {
  const client = useSFN();
  return useQuery({
    queryKey: executionsQueryKey(machineArn, statusFilter),
    queryFn: () =>
      allPages(async (nextToken) => {
        const page = await client.send(
          new ListExecutionsCommand({
            stateMachineArn: machineArn,
            statusFilter: statusFilter || undefined,
            nextToken,
          }),
        );
        return { items: page.executions ?? [], nextToken: page.nextToken };
      }),
    refetchInterval: (query) =>
      pollWhile(query.state.data?.some((execution) => execution.status === RUNNING_STATUS)),
  });
}

export function useExecution(arn: string) {
  const client = useSFN();
  return useQuery({
    queryKey: executionQueryKey(arn, "details"),
    queryFn: () => client.send(new DescribeExecutionCommand({ executionArn: arn })),
    retry: false,
    refetchInterval: (query) => pollWhile(query.state.data?.status === RUNNING_STATUS),
  });
}

export function useExecutionHistory(arn: string, running: boolean) {
  const client = useSFN();
  const query = useQuery({
    queryKey: executionQueryKey(arn, "history"),
    queryFn: () =>
      allPages(async (nextToken) => {
        const page = await client.send(
          new GetExecutionHistoryCommand({ executionArn: arn, nextToken }),
        );
        return { items: page.events ?? [], nextToken: page.nextToken };
      }),
    refetchInterval: pollWhile(running),
  });
  // Execution đổi trạng thái giữa hai lần hỏi lại history: lần hỏi cuối có thể thiếu event cuối
  // (bước cuối còn "Running" dù execution đã xong), nên hỏi thêm một lần khi chạy xong
  const { refetch } = query;
  useEffect(() => {
    if (!running) void refetch();
  }, [running, refetch]);
  return query;
}

interface StartInput {
  name: string;
  input: string;
}

export function useStartExecution(machineArn: string) {
  const client = useSFN();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, input }: StartInput) =>
      (
        await client.send(
          new StartExecutionCommand({
            stateMachineArn: machineArn,
            name: name || undefined,
            input,
          }),
        )
      ).executionArn ?? "",
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [STEPFUNCTIONS_QUERY_ROOT, "executions"] }),
  });
}

export function useStopExecution(arn: string) {
  const client = useSFN();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.send(new StopExecutionCommand({ executionArn: arn })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STEPFUNCTIONS_QUERY_ROOT] }),
  });
}
