import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DeleteFunctionEventInvokeConfigCommand,
  ListFunctionEventInvokeConfigsCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { toInvokeParams, type AsyncInvocationInput } from "../asyncInvocation.ts";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambda } from "./useLambda.ts";

const ASYNC_PART = "async-invocation";

// Đọc bằng List (không có thì mảng rỗng) vì Get trả 404 khi chưa cấu hình và console.error ồn
export function useAsyncInvocation(name: string) {
  const { lambda } = useLambda();
  return useQuery({
    queryKey: functionQueryKey(name, ASYNC_PART),
    queryFn: async () => {
      const page = await lambda.send(
        new ListFunctionEventInvokeConfigsCommand({ FunctionName: name }),
      );
      return page.FunctionEventInvokeConfigs?.[0] ?? null;
    },
  });
}

function useRefreshAsync(name: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: functionQueryKey(name, ASYNC_PART) });
}

export function usePutAsyncInvocation(name: string) {
  const { lambda } = useLambda();
  const refresh = useRefreshAsync(name);
  return useMutation({
    mutationFn: (values: AsyncInvocationInput) =>
      lambda.send(
        new PutFunctionEventInvokeConfigCommand({ FunctionName: name, ...toInvokeParams(values) }),
      ),
    onSuccess: refresh,
  });
}

export function useRemoveAsyncInvocation(name: string) {
  const { lambda } = useLambda();
  const refresh = useRefreshAsync(name);
  return useMutation({
    mutationFn: () =>
      lambda.send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: name })),
    onSuccess: refresh,
  });
}
