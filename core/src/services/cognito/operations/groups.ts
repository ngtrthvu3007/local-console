import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  GetGroupCommand,
  paginateAdminListGroupsForUser,
  paginateListGroups,
  paginateListUsersInGroup,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { LIST_GROUPS_PAGE_SIZE, LIST_USERS_PAGE_SIZE } from "#services/cognito/constants.ts";
import { toCreateGroupInput, type CreateGroupForm } from "#services/cognito/schemas.ts";

const NO_GROUP_ERROR = "Cognito returned no group";

export interface MembershipPair {
  username: string;
  group: string;
}

export interface MembershipChange {
  add: boolean;
  pairs: MembershipPair[];
}

export const listGroups = (cognito: CognitoIdentityProviderClient, poolId: string) =>
  collectPages(
    paginateListGroups({ client: cognito }, { UserPoolId: poolId, Limit: LIST_GROUPS_PAGE_SIZE }),
    (page) => page.Groups,
  );

export async function getGroup(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  group: string,
) {
  const { Group } = await cognito.send(
    new GetGroupCommand({ UserPoolId: poolId, GroupName: group }),
  );
  if (!Group) throw new Error(NO_GROUP_ERROR);
  return Group;
}

export const listGroupMembers = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  group: string,
) =>
  collectPages(
    paginateListUsersInGroup(
      { client: cognito },
      { UserPoolId: poolId, GroupName: group, Limit: LIST_USERS_PAGE_SIZE },
    ),
    (page) => page.Users,
  );

export const listUserGroups = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  username: string,
) =>
  collectPages(
    paginateAdminListGroupsForUser(
      { client: cognito },
      { UserPoolId: poolId, Username: username, Limit: LIST_GROUPS_PAGE_SIZE },
    ),
    (page) => page.Groups,
  );

export async function createGroup(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  form: CreateGroupForm,
) {
  const { Group } = await cognito.send(new CreateGroupCommand(toCreateGroupInput(poolId, form)));
  if (!Group) throw new Error(NO_GROUP_ERROR);
  return Group;
}

export const deleteGroups = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  groups: readonly string[],
) =>
  runEach(
    groups,
    (group) => group,
    (group) => cognito.send(new DeleteGroupCommand({ UserPoolId: poolId, GroupName: group })),
  );

export const setMembership = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  { add, pairs }: MembershipChange,
) =>
  runEach(
    pairs,
    ({ username, group }) => `${username} / ${group}`,
    ({ username, group }) => {
      const input = { UserPoolId: poolId, Username: username, GroupName: group };
      return cognito.send(
        add ? new AdminAddUserToGroupCommand(input) : new AdminRemoveUserFromGroupCommand(input),
      );
    },
  );
