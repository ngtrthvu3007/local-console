import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddTriggerInput,
  MappingOptions,
  StreamTriggerInput,
  TriggerRow,
} from "@localconsole/core/lambda";
import { SNS_QUERY_ROOT } from "../../sns/hooks/useTopics.ts";
import { functionQueryKey, LAMBDA_QUERY_ROOT } from "./useFunctions.ts";
import { useLambdaService } from "./useLambdaService.ts";
import { useLambdaTriggersService } from "./useLambdaTriggersService.ts";

const triggersQueryKey = (functionName: string) => functionQueryKey(functionName, "triggers");

export function useTriggers(functionName: string, functionArn: string) {
  const triggers = useLambdaTriggersService();

  return useQuery({
    queryKey: triggersQueryKey(functionName),
    queryFn: () => triggers.listTriggers({ name: functionName, arn: functionArn }),
  });
}

function useTriggerMutation<TInput>(
  functionName: string,
  run: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(functionName) }),
        // Xóa trigger SNS là xóa subscription, nên danh sách bên SNS cũng đổi
        queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT] }),
      ]),
  });
}

// Trigger của một stream (DynamoDB Stream, Kinesis), xem từ trang của nguồn
const streamTriggersQueryKey = (streamArn?: string) => [
  LAMBDA_QUERY_ROOT,
  "stream-triggers",
  streamArn,
];

export function useStreamTriggers(streamArn?: string) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: streamTriggersQueryKey(streamArn),
    enabled: Boolean(streamArn),
    queryFn: () => lambda.listMappings({ sourceArn: streamArn }),
  });
}

export function useAddStreamTrigger(streamArn: string) {
  const lambda = useLambdaService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<StreamTriggerInput, "streamArn">) =>
      lambda.createStreamTrigger({ ...input, streamArn }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: streamTriggersQueryKey(streamArn) }),
  });
}

export function useAddTrigger(functionName: string, functionArn: string) {
  const triggers = useLambdaTriggersService();

  return useTriggerMutation(functionName, (values: AddTriggerInput) =>
    triggers.addTrigger({ name: functionName, arn: functionArn }, values),
  );
}

export function useDeleteTrigger(functionName: string) {
  const triggers = useLambdaTriggersService();

  return useTriggerMutation(functionName, (row: TriggerRow) => triggers.deleteTrigger(row));
}

interface EditTriggerInput {
  row: TriggerRow;
  batchSize: number;
  options: MappingOptions;
}

// UpdateEventSourceMapping ghi đè cả cấu hình nên gửi đủ các ô (xem toMappingParams)
export function useEditTrigger(functionName: string) {
  const lambda = useLambdaService();

  return useTriggerMutation(functionName, ({ row, batchSize, options }: EditTriggerInput) =>
    lambda.editMapping({ uuid: row.mapping?.UUID, source: row.source, batchSize, options }),
  );
}

export function useSetTriggerEnabled(functionName: string) {
  const lambda = useLambdaService();

  return useTriggerMutation(functionName, (input: { uuid: string; enabled: boolean }) =>
    lambda.setMappingEnabled(input),
  );
}
