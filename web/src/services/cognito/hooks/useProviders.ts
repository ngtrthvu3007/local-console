import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderForm } from "@localconsole/core/cognito";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

const providersQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "providers", poolId];

const providerQueryKey = (poolId: string, name: string) => [
  COGNITO_QUERY_ROOT,
  "provider",
  poolId,
  name,
];

export function useProviders(poolId: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: providersQueryKey(poolId),
    queryFn: () => cognito.listProviders(poolId),
  });
}

export function useProvider(poolId: string, name: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: providerQueryKey(poolId, name),
    retry: false,
    // Trang tạo không có tên: không gọi Describe với tên rỗng
    enabled: Boolean(name),
    queryFn: () => cognito.getProvider(poolId, name),
  });
}

export function useCreateProvider(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: ProviderForm) => cognito.createProvider(poolId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
  });
}

export function useUpdateProvider(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: ProviderForm) => cognito.updateProvider(poolId, form),
    onSuccess: (name) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: providerQueryKey(poolId, name) }),
      ]),
  });
}

export function useDeleteProviders(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => cognito.deleteProviders(poolId, names),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
  });
}
