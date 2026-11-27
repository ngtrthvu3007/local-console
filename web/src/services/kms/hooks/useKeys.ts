import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KeyActionInput, KeyManager, KeyRow, NewKey } from "@localconsole/core/kms";
import { useKmsService } from "./useKmsService.ts";

export type { KeyRow };

export const KMS_QUERY_ROOT = "kms";
const keysQueryKey = (manager: KeyManager) => [KMS_QUERY_ROOT, "keys", manager];
const keyQueryKey = (key: string) => [KMS_QUERY_ROOT, "key", key];

export function useKeys(manager: KeyManager) {
  const kms = useKmsService();

  return useQuery({ queryKey: keysQueryKey(manager), queryFn: () => kms.listKeys(manager) });
}

export function useKey(key: string) {
  const kms = useKmsService();

  return useQuery({ queryKey: keyQueryKey(key), retry: false, queryFn: () => kms.getKey(key) });
}

export function useKeyExists(key: string) {
  const kms = useKmsService();

  return useQuery({
    queryKey: [...keyQueryKey(key), "exists"],
    queryFn: () => kms.keyExists(key),
    retry: false,
  });
}

export function useKeyAction() {
  const kms = useKmsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: KeyActionInput) => kms.keyAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

export function useKeyPolicy(keyId: string) {
  const kms = useKmsService();

  return useQuery({
    queryKey: [...keyQueryKey(keyId), "policy"],
    queryFn: () => kms.getKeyPolicy(keyId),
  });
}

export function useUpdateDescription() {
  const kms = useKmsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: kms.updateDescription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

export function useCreateKey() {
  const kms = useKmsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewKey) => kms.createKey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

export function useKeyOptions() {
  const kms = useKmsService();

  return useQuery({ queryKey: [KMS_QUERY_ROOT, "options"], queryFn: kms.listKeyOptions });
}
