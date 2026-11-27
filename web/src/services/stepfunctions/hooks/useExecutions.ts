import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionStatus } from "@aws-sdk/client-sfn";
import { type StartExecutionInput, RUNNING_STATUS } from "@localconsole/core/stepfunctions";
import { EXECUTION_POLL_INTERVAL_MS } from "../constants.ts";
import { STEPFUNCTIONS_QUERY_ROOT } from "./useStateMachines.ts";
import { useStepFunctionsService } from "./useStepFunctionsService.ts";

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

// Còn execution chạy dở thì hỏi lại đều, hết thì thôi
const pollWhile = (running: boolean | undefined) => (running ? EXECUTION_POLL_INTERVAL_MS : false);

export function useExecutionList(machineArn: string, statusFilter: ExecutionStatus | "") {
  const sfn = useStepFunctionsService();

  return useQuery({
    queryKey: executionsQueryKey(machineArn, statusFilter),
    queryFn: () => sfn.listExecutions(machineArn, statusFilter),
    refetchInterval: (query) =>
      pollWhile(query.state.data?.some((execution) => execution.status === RUNNING_STATUS)),
  });
}

export function useExecution(arn: string) {
  const sfn = useStepFunctionsService();

  return useQuery({
    queryKey: executionQueryKey(arn, "details"),
    queryFn: () => sfn.getExecution(arn),
    retry: false,
    refetchInterval: (query) => pollWhile(query.state.data?.status === RUNNING_STATUS),
  });
}

export function useExecutionHistory(arn: string, running: boolean) {
  const sfn = useStepFunctionsService();

  const query = useQuery({
    queryKey: executionQueryKey(arn, "history"),
    queryFn: () => sfn.getExecutionHistory(arn),
    refetchInterval: pollWhile(running),
  });

  // Lần hỏi history cuối có thể thiếu event cuối, nên hỏi thêm một lần khi execution xong
  const { refetch } = query;

  useEffect(() => {
    if (!running) void refetch();
  }, [running, refetch]);

  return query;
}

export function useStartExecution(machineArn: string) {
  const sfn = useStepFunctionsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartExecutionInput) => sfn.startExecution(machineArn, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [STEPFUNCTIONS_QUERY_ROOT, "executions"] }),
  });
}

export function useStopExecution(arn: string) {
  const sfn = useStepFunctionsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sfn.stopExecution(arn),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STEPFUNCTIONS_QUERY_ROOT] }),
  });
}
