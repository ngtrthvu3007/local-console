import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import type { CreateUserForm, SetPasswordForm, UserActionInput } from "@localconsole/core/cognito";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

const usersQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "users", poolId];
const userKeyPrefix = (poolId: string) => [COGNITO_QUERY_ROOT, "user", poolId];

const userQueryKey = (poolId: string, username: string) => [...userKeyPrefix(poolId), username];

export function useUsers(poolId: string) {
  const cognito = useCognitoService();

  return useQuery({ queryKey: usersQueryKey(poolId), queryFn: () => cognito.listUsers(poolId) });
}

export function useUser(poolId: string, username: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: userQueryKey(poolId, username),
    retry: false,
    queryFn: () => cognito.getUser(poolId, username),
  });
}

// Mọi thao tác user xong thì làm mới danh sách và chi tiết
function useInvalidateUsers(poolId: string) {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: usersQueryKey(poolId) }),
      queryClient.invalidateQueries({ queryKey: userKeyPrefix(poolId) }),
    ]);
}

export function useCreateUser(poolId: string, signInWithEmail: boolean) {
  const cognito = useCognitoService();
  const invalidate = useInvalidateUsers(poolId);

  return useMutation({
    mutationFn: (form: CreateUserForm) => cognito.createUser(poolId, form, signInWithEmail),
    onSuccess: invalidate,
  });
}

export function useUserActions(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateUsers(poolId);

  return useMutation({
    mutationFn: (input: UserActionInput) => cognito.runUserAction(poolId, input),
    // Xóa user: không refetch chi tiết của chính user vừa xóa, kẻo trang báo "not found" trước khi điều hướng
    onSuccess: (_result, { action }) =>
      action === "delete"
        ? queryClient.invalidateQueries({ queryKey: usersQueryKey(poolId) })
        : invalidate(),
  });
}

export function useSetUserPassword(poolId: string, username: string) {
  const cognito = useCognitoService();
  const invalidate = useInvalidateUsers(poolId);

  return useMutation({
    mutationFn: (form: SetPasswordForm) => cognito.setUserPassword(poolId, username, form),
    onSuccess: invalidate,
  });
}

export function useUpdateUserAttributes(poolId: string, username: string) {
  const cognito = useCognitoService();
  const invalidate = useInvalidateUsers(poolId);

  return useMutation({
    mutationFn: (attributes: AttributeType[]) =>
      cognito.updateUserAttributes(poolId, username, attributes),
    onSuccess: invalidate,
  });
}

export function useDeleteUserAttribute(poolId: string, username: string) {
  const cognito = useCognitoService();
  const invalidate = useInvalidateUsers(poolId);

  return useMutation({
    mutationFn: (name: string) => cognito.deleteUserAttribute(poolId, username, name),
    onSuccess: invalidate,
  });
}
