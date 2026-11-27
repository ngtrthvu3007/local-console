import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AsyncInvocationInput } from "@localconsole/core/lambda";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambdaService } from "./useLambdaService.ts";

const ASYNC_PART = "async-invocation";

export function useAsyncInvocation(name: string) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: functionQueryKey(name, ASYNC_PART),
    queryFn: () => lambda.getAsyncInvocation(name),
  });
}

function useRefreshAsync(name: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: functionQueryKey(name, ASYNC_PART) });
}

export function usePutAsyncInvocation(name: string) {
  const lambda = useLambdaService();
  const refresh = useRefreshAsync(name);

  return useMutation({
    mutationFn: (values: AsyncInvocationInput) => lambda.putAsyncInvocation(name, values),
    onSuccess: refresh,
  });
}

export function useRemoveAsyncInvocation(name: string) {
  const lambda = useLambdaService();
  const refresh = useRefreshAsync(name);

  return useMutation({ mutationFn: () => lambda.removeAsyncInvocation(name), onSuccess: refresh });
}
