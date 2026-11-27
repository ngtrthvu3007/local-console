import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import type { PoolChange } from "@localconsole/core/cognito";
import { LAMBDA_QUERY_ROOT } from "../../lambda/hooks/useFunctions.ts";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

const poolsQueryKey = [COGNITO_QUERY_ROOT, "pools"];
const poolQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "pool", poolId];

export function useUserPools() {
  const cognito = useCognitoService();

  return useQuery({ queryKey: poolsQueryKey, queryFn: cognito.listUserPools });
}

export function useUserPool(poolId: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: poolQueryKey(poolId),
    retry: false,
    queryFn: () => cognito.getUserPool(poolId),
  });
}

export function useCreateUserPool() {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cognito.createUserPool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolsQueryKey }),
  });
}

export function useDeleteUserPools() {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cognito.deleteUserPools,
    // Pool bị xóa thì trigger của Lambda trỏ tới nó cũng đổi
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: poolsQueryKey }),
        queryClient.invalidateQueries({ queryKey: [LAMBDA_QUERY_ROOT] }),
      ]),
  });
}

export function useUpdateUserPool(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation<void, Error, PoolChange | ((fresh: UserPoolType) => PoolChange)>({
    mutationFn: (change) => cognito.updateUserPool(poolId, change),
    // Trigger đổi thì tab Triggers của Lambda cũng đổi
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: poolQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: poolsQueryKey }),
        queryClient.invalidateQueries({ queryKey: [LAMBDA_QUERY_ROOT] }),
      ]),
  });
}

// Domain nằm trong DescribeUserPool.Domain nên chỉ cần làm mới pool
export function useCreateDomain(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (domain) => cognito.createDomain(poolId, domain),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolQueryKey(poolId) }),
  });
}

export function useDeleteDomain(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (domain) => cognito.deleteDomain(poolId, domain),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolQueryKey(poolId) }),
  });
}
