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
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { LIST_USERS_PAGE_SIZE } from "#services/cognito/constants.ts";
import {
  toAdminCreateUserInput,
  type CreateUserForm,
  type SetPasswordForm,
} from "#services/cognito/schemas.ts";

export type UserAction = "confirm" | "enable" | "disable" | "resetPassword" | "signOut" | "delete";

export interface UserActionInput {
  action: UserAction;
  usernames: string[];
}

export const listUsers = (cognito: CognitoIdentityProviderClient, poolId: string) =>
  collectPages(
    paginateListUsers({ client: cognito }, { UserPoolId: poolId, Limit: LIST_USERS_PAGE_SIZE }),
    (page) => page.Users,
  );

export const getUser = (cognito: CognitoIdentityProviderClient, poolId: string, username: string) =>
  cognito.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: username }));

export async function createUser(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  form: CreateUserForm,
  signInWithEmail: boolean,
) {
  const { User } = await cognito.send(
    new AdminCreateUserCommand(toAdminCreateUserInput(poolId, form, signInWithEmail)),
  );
  if (!User) throw new Error("Cognito returned no user");
  return User;
}

function actionCommand(action: UserAction, poolId: string, username: string) {
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
}

export const runUserAction = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  { action, usernames }: UserActionInput,
) =>
  runEach(
    usernames,
    (username) => username,
    (username) => cognito.send(actionCommand(action, poolId, username)),
  );

export const setUserPassword = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  username: string,
  { password, permanent }: SetPasswordForm,
) =>
  cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: username,
      Password: password,
      Permanent: permanent,
    }),
  );

export const updateUserAttributes = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  username: string,
  attributes: AttributeType[],
) =>
  cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributes: attributes,
    }),
  );

export const deleteUserAttribute = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  username: string,
  name: string,
) =>
  cognito.send(
    new AdminDeleteUserAttributesCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributeNames: [name],
    }),
  );
