import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateGroupForm, MembershipChange } from "@localconsole/core/cognito";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

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
  const cognito = useCognitoService();

  return useQuery({ queryKey: groupsQueryKey(poolId), queryFn: () => cognito.listGroups(poolId) });
}

export function useGroup(poolId: string, group: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: groupKey(poolId, group),
    retry: false,
    queryFn: () => cognito.getGroup(poolId, group),
  });
}

export function useGroupMembers(poolId: string, group: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: membersKey(poolId, group),
    queryFn: () => cognito.listGroupMembers(poolId, group),
  });
}

export function useUserGroups(poolId: string, username: string) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: userGroupsKey(poolId, username),
    queryFn: () => cognito.listUserGroups(poolId, username),
  });
}

export function useCreateGroup(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CreateGroupForm) => cognito.createGroup(poolId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupsQueryKey(poolId) }),
  });
}

export function useDeleteGroups(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groups: string[]) => cognito.deleteGroups(poolId, groups),
    // Không refetch chi tiết group vừa xóa (sẽ 404); khối Groups của user thì phải làm mới kẻo còn hiện group đã xóa
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: groupsQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: userGroupsKeyPrefix(poolId) }),
      ]),
  });
}

export function useSetMembership(poolId: string) {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: MembershipChange) => cognito.setMembership(poolId, change),
    // Làm mới cả hai phía: bảng thành viên của group và khối Groups của user
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membersKeyPrefix(poolId) }),
        queryClient.invalidateQueries({ queryKey: userGroupsKeyPrefix(poolId) }),
      ]),
  });
}
