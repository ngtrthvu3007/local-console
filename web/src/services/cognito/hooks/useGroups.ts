import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  GetGroupCommand,
  paginateAdminListGroupsForUser,
  paginateListGroups,
  paginateListUsersInGroup,
  type GroupType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LIST_GROUPS_PAGE_SIZE, LIST_USERS_PAGE_SIZE } from "../constants.ts";
import { toCreateGroupInput, type CreateGroupForm } from "../schemas.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

const groupsQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "groups", poolId];
const groupKey = (poolId: string, group: string) => [COGNITO_QUERY_ROOT, "group", poolId, group];
const membersKeyPrefix = (poolId: string) => [COGNITO_QUERY_ROOT, "groupMembers", poolId];
const membersKey = (poolId: string, group: string) => [...membersKeyPrefix(poolId), group];
const userGroupsKeyPrefix = (poolId: string) => [COGNITO_QUERY_ROOT, "userGroups", poolId];

const userGroupsKey = (poolId: string, username: string) => [
  ...userGroupsKeyPrefix(poolId),
  username,
];

export function useGroups(poolId: string) {
  const client = useCognito();

  return useQuery({
    queryKey: groupsQueryKey(poolId),
    queryFn: async () => {
      const groups: GroupType[] = [];

      for await (const page of paginateListGroups(
        { client },
        { UserPoolId: poolId, Limit: LIST_GROUPS_PAGE_SIZE },
      ))
        groups.push(...(page.Groups ?? []));

      return groups;
    },
  });
}

export function useGroup(poolId: string, group: string) {
  const client = useCognito();

  return useQuery({
    queryKey: groupKey(poolId, group),
    retry: false,
    queryFn: async () => {
      const { Group } = await client.send(
        new GetGroupCommand({ UserPoolId: poolId, GroupName: group }),
      );

      if (!Group) throw new Error("Cognito returned no group");
      return Group;
    },
  });
}

export function useGroupMembers(poolId: string, group: string) {
  const client = useCognito();

  return useQuery({
    queryKey: membersKey(poolId, group),
    queryFn: async () => {
      const users: UserType[] = [];

      for await (const page of paginateListUsersInGroup(
        { client },
        { UserPoolId: poolId, GroupName: group, Limit: LIST_USERS_PAGE_SIZE },
      ))
        users.push(...(page.Users ?? []));

      return users;
    },
  });
}

export function useUserGroups(poolId: string, username: string) {
  const client = useCognito();

  return useQuery({
    queryKey: userGroupsKey(poolId, username),
    queryFn: async () => {
      const groups: GroupType[] = [];

      for await (const page of paginateAdminListGroupsForUser(
        { client },
        { UserPoolId: poolId, Username: username, Limit: LIST_GROUPS_PAGE_SIZE },
      ))
        groups.push(...(page.Groups ?? []));

      return groups;
    },
  });
}

export function useCreateGroup(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (form: CreateGroupForm) => {
      const { Group } = await client.send(new CreateGroupCommand(toCreateGroupInput(poolId, form)));
      if (!Group) throw new Error("Cognito returned no group");
      return Group;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupsQueryKey(poolId) }),
  });
}

export function useDeleteGroups(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groups: string[]) =>
      runEach(
        groups,
        (group) => group,
        (group) => client.send(new DeleteGroupCommand({ UserPoolId: poolId, GroupName: group })),
      ),
    // Không refetch chi tiết group vừa xóa (sẽ 404); khối Groups của user thì phải làm mới kẻo còn hiện group đã xóa
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: groupsQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: userGroupsKeyPrefix(poolId) }),
      ]),
  });
}

interface MembershipPair {
  username: string;
  group: string;
}

export function useSetMembership(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ add, pairs }: { add: boolean; pairs: MembershipPair[] }) =>
      runEach(
        pairs,
        ({ username, group }) => `${username} / ${group}`,
        ({ username, group }) => {
          const input = { UserPoolId: poolId, Username: username, GroupName: group };

          return client.send(
            add
              ? new AdminAddUserToGroupCommand(input)
              : new AdminRemoveUserFromGroupCommand(input),
          );
        },
      ),
    // Làm mới cả hai phía: bảng thành viên của group và khối Groups của user
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membersKeyPrefix(poolId) }),
        queryClient.invalidateQueries({ queryKey: userGroupsKeyPrefix(poolId) }),
      ]),
  });
}
