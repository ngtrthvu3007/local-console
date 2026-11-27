import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewSecret, RotationInput } from "@localconsole/core/secretsmanager";
import { useSecretsService } from "./useSecretsService.ts";

const SECRETS_QUERY_ROOT = "secretsmanager";
const secretsQueryKey = [SECRETS_QUERY_ROOT, "secrets"];
const secretQueryKey = (name: string) => [SECRETS_QUERY_ROOT, "secret", name];
const VALUE = "value";

export function useSecrets() {
  const secrets = useSecretsService();

  return useQuery({ queryKey: secretsQueryKey, queryFn: secrets.listSecrets });
}

export function useCreateSecret() {
  const secrets = useSecretsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewSecret) => secrets.createSecret(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: secretsQueryKey }),
  });
}

export function useDeleteSecret() {
  const secrets = useSecretsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: secrets.deleteSecret,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SECRETS_QUERY_ROOT] }),
  });
}

export function useSecret(name: string) {
  const secrets = useSecretsService();

  return useQuery({
    queryKey: secretQueryKey(name),
    queryFn: () => secrets.getSecret(name),
    retry: false,
  });
}

// Chỉ đọc khi người dùng bấm Retrieve (giống AWS)
export function useSecretValue(name: string, enabled: boolean) {
  const secrets = useSecretsService();

  return useQuery({
    queryKey: [...secretQueryKey(name), VALUE],
    queryFn: () => secrets.getSecretValue(name),
    enabled,
    gcTime: 0,
  });
}

const useSecretMutation = <TInput>(name: string, send: (input: TInput) => Promise<unknown>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: secretQueryKey(name) }),
  });
};

export function usePutSecretValue(name: string) {
  const secrets = useSecretsService();

  return useSecretMutation(name, (value: string) => secrets.putSecretValue(name, value));
}

export function useUpdateDescription(name: string) {
  const secrets = useSecretsService();

  return useSecretMutation(name, (description: string) =>
    secrets.updateDescription(name, description),
  );
}

export function useConfigureRotation(name: string) {
  const secrets = useSecretsService();

  return useSecretMutation(name, (input: RotationInput) => secrets.configureRotation(name, input));
}

export function useCancelRotation(name: string) {
  const secrets = useSecretsService();

  return useSecretMutation(name, () => secrets.cancelRotation(name));
}

export function useRotateNow(name: string) {
  const secrets = useSecretsService();

  return useSecretMutation(name, () => secrets.rotateNow(name));
}
