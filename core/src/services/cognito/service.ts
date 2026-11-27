import type {
  AttributeType,
  CognitoIdentityProviderClient,
  UserPoolDescriptionType,
  UserPoolType,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  ClientForm,
  CreateGroupForm,
  CreatePoolForm,
  CreateUserForm,
  ProviderForm,
  SetPasswordForm,
} from "./schemas.ts";
import {
  createClient,
  deleteClients,
  getClient,
  listClients,
  updateClient,
} from "./operations/clients.ts";
import {
  createGroup,
  deleteGroups,
  getGroup,
  listGroupMembers,
  listGroups,
  listUserGroups,
  setMembership,
  type MembershipChange,
} from "./operations/groups.ts";
import {
  createDomain,
  createUserPool,
  deleteDomain,
  deleteUserPools,
  getUserPool,
  listPoolTriggers,
  listTriggerUses,
  listUserPools,
  updateUserPool,
  type PoolChange,
} from "./operations/pools.ts";
import {
  createProvider,
  deleteProviders,
  getProvider,
  listProviders,
  updateProvider,
} from "./operations/providers.ts";
import {
  respondNewPassword,
  signIn,
  type NewPasswordInput,
  type SignInInput,
} from "./operations/signIn.ts";
import {
  createUser,
  deleteUserAttribute,
  getUser,
  listUsers,
  runUserAction,
  setUserPassword,
  updateUserAttributes,
  type UserActionInput,
} from "./operations/users.ts";

export function createCognitoService(cognito: CognitoIdentityProviderClient) {
  return {
    listUserPools: () => listUserPools(cognito),
    listPoolTriggers: (functionArn: string) => listPoolTriggers(cognito, functionArn),
    listTriggerUses: (functions: readonly { name: string; arn: string }[]) =>
      listTriggerUses(cognito, functions),
    getUserPool: (poolId: string) => getUserPool(cognito, poolId),
    createUserPool: (form: CreatePoolForm) => createUserPool(cognito, form),
    deleteUserPools: (pools: readonly UserPoolDescriptionType[]) => deleteUserPools(cognito, pools),
    updateUserPool: (poolId: string, change: PoolChange | ((fresh: UserPoolType) => PoolChange)) =>
      updateUserPool(cognito, poolId, change),
    createDomain: (poolId: string, domain: string) => createDomain(cognito, poolId, domain),
    deleteDomain: (poolId: string, domain: string) => deleteDomain(cognito, poolId, domain),

    listClients: (poolId: string) => listClients(cognito, poolId),
    getClient: (poolId: string, clientId: string) => getClient(cognito, poolId, clientId),
    createClient: (poolId: string, form: ClientForm) => createClient(cognito, poolId, form),
    updateClient: (poolId: string, clientId: string, form: ClientForm) =>
      updateClient(cognito, poolId, clientId, form),
    deleteClients: (poolId: string, clientIds: readonly string[]) =>
      deleteClients(cognito, poolId, clientIds),

    listGroups: (poolId: string) => listGroups(cognito, poolId),
    getGroup: (poolId: string, group: string) => getGroup(cognito, poolId, group),
    listGroupMembers: (poolId: string, group: string) => listGroupMembers(cognito, poolId, group),
    listUserGroups: (poolId: string, username: string) => listUserGroups(cognito, poolId, username),
    createGroup: (poolId: string, form: CreateGroupForm) => createGroup(cognito, poolId, form),
    deleteGroups: (poolId: string, groups: readonly string[]) =>
      deleteGroups(cognito, poolId, groups),
    setMembership: (poolId: string, change: MembershipChange) =>
      setMembership(cognito, poolId, change),

    listUsers: (poolId: string) => listUsers(cognito, poolId),
    getUser: (poolId: string, username: string) => getUser(cognito, poolId, username),
    createUser: (poolId: string, form: CreateUserForm, signInWithEmail: boolean) =>
      createUser(cognito, poolId, form, signInWithEmail),
    runUserAction: (poolId: string, input: UserActionInput) =>
      runUserAction(cognito, poolId, input),
    setUserPassword: (poolId: string, username: string, form: SetPasswordForm) =>
      setUserPassword(cognito, poolId, username, form),
    updateUserAttributes: (poolId: string, username: string, attributes: AttributeType[]) =>
      updateUserAttributes(cognito, poolId, username, attributes),
    deleteUserAttribute: (poolId: string, username: string, name: string) =>
      deleteUserAttribute(cognito, poolId, username, name),

    listProviders: (poolId: string) => listProviders(cognito, poolId),
    getProvider: (poolId: string, name: string) => getProvider(cognito, poolId, name),
    createProvider: (poolId: string, form: ProviderForm) => createProvider(cognito, poolId, form),
    updateProvider: (poolId: string, form: ProviderForm) => updateProvider(cognito, poolId, form),
    deleteProviders: (poolId: string, names: readonly string[]) =>
      deleteProviders(cognito, poolId, names),

    signIn: (input: SignInInput) => signIn(cognito, input),
    respondNewPassword: (input: NewPasswordInput) => respondNewPassword(cognito, input),
  };
}

export type CognitoService = ReturnType<typeof createCognitoService>;
