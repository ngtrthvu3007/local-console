import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminDeleteUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  paginateListUsers,
  type AttributeType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LIST_USERS_PAGE_SIZE } from "../constants.ts";
import { toAdminCreateUserInput, type CreateUserForm, type SetPasswordForm } from "../schemas.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

export const usersQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "users", poolId];
const userKeyPrefix = (poolId: string) => [COGNITO_QUERY_ROOT, "user", poolId];
export const userQueryKey = (poolId: string, username: string) => [
  ...userKeyPrefix(poolId),
  username,
];

export type UserAction =
  "confirm" | "enable" | "disable" | "resetPassword" | "signOut" | "delete";

export function useUsers(poolId: string) {
  const client = useCognito();
  return useQuery({
    queryKey: usersQueryKey(poolId),
    queryFn: async () => {
      const users: UserType[] = [];
      for await (const page of paginateListUsers(
        { client },
        { UserPoolId: poolId, Limit: LIST_USERS_PAGE_SIZE },
      ))
        users.push(...(page.Users ?? []));
      return users;
    },
  });
}

export function useUser(poolId: string, username: string) {
  const client = useCognito();
  return useQuery({
    queryKey: userQueryKey(poolId, username),
    retry: false,
    queryFn: () => client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: username })),
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
  const client = useCognito();
  const invalidate = useInvalidateUsers(poolId);
  return useMutation({
    mutationFn: async (form: CreateUserForm) => {
      const { User } = await client.send(
        new AdminCreateUserCommand(toAdminCreateUserInput(poolId, form, signInWithEmail)),
      );
      if (!User) throw new Error("Cognito returned no user");
      return User;
    },
    onSuccess: invalidate,
  });
}

export function useUserActions(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateUsers(poolId);
  const commands = (action: UserAction, username: string) => {
    const input = { UserPoolId: poolId, Username: username };
    switch (action) {
      case "confirm":
        return new AdminConfirmSignUpCommand(input);
      case "enable":
        return new AdminEnableUserCommand(input);
      case "disable":
        return new AdminDisableUserCommand(input);
      case "resetPassword":
        return new AdminResetUserPasswordCommand(input);
      case "signOut":
        return new AdminUserGlobalSignOutCommand(input);
      case "delete":
        return new AdminDeleteUserCommand(input);
    }
  };
  return useMutation({
    mutationFn: ({ action, usernames }: { action: UserAction; usernames: string[] }) =>
      runEach(
        usernames,
        (username) => username,
        (username) => client.send(commands(action, username)),
      ),
    // Xóa user: không refetch chi tiết của chính user vừa xóa, kẻo trang báo "not found" trước khi điều hướng
    onSuccess: (_result, { action }) =>
      action === "delete"
        ? queryClient.invalidateQueries({ queryKey: usersQueryKey(poolId) })
        : invalidate(),
  });
}

export function useSetUserPassword(poolId: string, username: string) {
  const client = useCognito();
  const invalidate = useInvalidateUsers(poolId);
  return useMutation({
    mutationFn: ({ password, permanent }: SetPasswordForm) =>
      client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: username,
          Password: password,
          Permanent: permanent,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateUserAttributes(poolId: string, username: string) {
  const client = useCognito();
  const invalidate = useInvalidateUsers(poolId);
  return useMutation({
    mutationFn: (attributes: AttributeType[]) =>
      client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: poolId,
          Username: username,
          UserAttributes: attributes,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteUserAttribute(poolId: string, username: string) {
  const client = useCognito();
  const invalidate = useInvalidateUsers(poolId);
  return useMutation({
    mutationFn: (name: string) =>
      client.send(
        new AdminDeleteUserAttributesCommand({
          UserPoolId: poolId,
          Username: username,
          UserAttributeNames: [name],
        }),
      ),
    onSuccess: invalidate,
  });
}
