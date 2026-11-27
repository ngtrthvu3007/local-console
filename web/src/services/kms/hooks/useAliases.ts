import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AliasInput } from "@localconsole/core/kms";
import { KMS_QUERY_ROOT } from "./useKeys.ts";
import { useKmsService } from "./useKmsService.ts";

export function useAllAliases() {
  const kms = useKmsService();

  return useQuery({ queryKey: [KMS_QUERY_ROOT, "aliases"], queryFn: kms.listAliases });
}

function useAliasMutation<T>(run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

export function useSaveAlias() {
  const kms = useKmsService();

  return useAliasMutation((input: AliasInput) => kms.saveAlias(input));
}

export function useDeleteAlias() {
  const kms = useKmsService();

  return useAliasMutation((name: string) => kms.deleteAlias(name));
}
