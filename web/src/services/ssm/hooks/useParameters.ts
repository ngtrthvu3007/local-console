import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ParameterInput } from "@localconsole/core/ssm";
import { useSsmService } from "./useSsmService.ts";

const SSM_QUERY_ROOT = "ssm";
const parametersQueryKey = [SSM_QUERY_ROOT, "parameters"];
const parameterQueryKey = (name: string) => [SSM_QUERY_ROOT, "parameter", name];

export function useParameters() {
  const ssm = useSsmService();

  return useQuery({ queryKey: parametersQueryKey, queryFn: ssm.listParameters });
}

export function useParameter(name: string) {
  const ssm = useSsmService();

  return useQuery({
    queryKey: parameterQueryKey(name),
    queryFn: () => ssm.getParameter(name),
    retry: false,
  });
}

export function usePutParameter(editing: boolean) {
  const ssm = useSsmService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ParameterInput) => ssm.putParameter(input, editing),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SSM_QUERY_ROOT] }),
  });
}

export function useDeleteParameters() {
  const ssm = useSsmService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ssm.deleteParameters,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SSM_QUERY_ROOT] }),
  });
}
