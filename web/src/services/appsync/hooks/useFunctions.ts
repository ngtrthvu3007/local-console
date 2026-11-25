import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  UpdateFunctionCommand,
  paginateListFunctions,
  type FunctionConfiguration,
} from "@aws-sdk/client-appsync";
import { functionInput } from "../apis.ts";
import type { FunctionForm } from "../schemas.ts";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSync } from "./useAppSync.ts";

export const functionsQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "functions", apiId];

// Pipeline function của API (khác function Lambda)
export function useApiFunctions(apiId: string) {
  const client = useAppSync();

  return useQuery({
    queryKey: functionsQueryKey(apiId),
    queryFn: async () => {
      const functions: FunctionConfiguration[] = [];
      for await (const page of paginateListFunctions({ client }, { apiId })) {
        functions.push(...(page.functions ?? []));
      }
      return functions;
    },
  });
}

// functionId có = sửa; trả functionId để mở lại trang
export function useSaveFunction(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ functionId, form }: { functionId?: string; form: FunctionForm }) => {
      const input = { apiId, ...functionInput(form) };
      const { functionConfiguration } = functionId
        ? await client.send(new UpdateFunctionCommand({ ...input, functionId }))
        : await client.send(new CreateFunctionCommand(input));
      return functionConfiguration?.functionId ?? "";
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey(apiId) }),
  });
}

export function useDeleteFunction(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (functionId: string) =>
      client.send(new DeleteFunctionCommand({ apiId, functionId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey(apiId) }),
  });
}
