import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateAliasCommand, DeleteAliasCommand, UpdateAliasCommand } from "@aws-sdk/client-kms";
import { KMS_QUERY_ROOT, listAliasEntries } from "./useKeys.ts";
import { useKMS } from "./useKMS.ts";

// Mọi alias (của mọi key): tab Aliases cần biết tên đã thuộc key khác để hỏi trỏ lại
export function useAllAliases() {
  const client = useKMS();

  return useQuery({
    queryKey: [KMS_QUERY_ROOT, "aliases"],
    queryFn: () => listAliasEntries(client),
  });
}

interface AliasInput {
  name: string;
  keyId: string;
  replace: boolean; // tên đã thuộc key khác → UpdateAlias trỏ sang key này
}

function useAliasMutation<T>(run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

export function useSaveAlias() {
  const client = useKMS();

  return useAliasMutation(({ name, keyId, replace }: AliasInput) =>
    client.send(
      replace
        ? new UpdateAliasCommand({ AliasName: name, TargetKeyId: keyId })
        : new CreateAliasCommand({ AliasName: name, TargetKeyId: keyId }),
    ),
  );
}

export function useDeleteAlias() {
  const client = useKMS();

  return useAliasMutation((name: string) =>
    client.send(new DeleteAliasCommand({ AliasName: name })),
  );
}
