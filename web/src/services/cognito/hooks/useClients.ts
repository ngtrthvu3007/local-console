import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientForm } from "@localconsole/core/cognito";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

const clientsQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "clients", poolId];

const clientQueryKey = (poolId: string, clientId: string) => [
  COGNITO_QUERY_ROOT,
  "client",
  poolId,
  clientId,
];

export function useClients(poolId: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: clientsQueryKey(poolId),
    queryFn: () => cognito.listClients(poolId),
  });
}

export function useClient(poolId: string, clientId: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: clientQueryKey(poolId, clientId),
    retry: false,
    // Trang tạo không có clientId: không gọi Describe với ID rỗng
    enabled: Boolean(clientId),
    queryFn: () => cognito.getClient(poolId, clientId),
  });
}

export function useCreateClient(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: ClientForm) => cognito.createClient(poolId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
  });
}

export function useUpdateClient(poolId: string, clientId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: ClientForm) => cognito.updateClient(poolId, clientId, form),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: clientQueryKey(poolId, clientId) }),
      ]),
  });
}

export function useDeleteClients(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientIds: string[]) => cognito.deleteClients(poolId, clientIds),
    // Chỉ làm mới danh sách: refetch chi tiết client vừa xóa sẽ nháy "not found"
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
  });
}
