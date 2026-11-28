import {
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  DeleteUserPoolCommand,
  DeleteUserPoolDomainCommand,
  DeletionProtectionType,
  DescribeUserPoolCommand,
  paginateListUserPools,
  UpdateUserPoolCommand,
  type CognitoIdentityProviderClient,
  type UpdateUserPoolRequest,
  type UserPoolDescriptionType,
  type UserPoolType,
} from "@aws-sdk/client-cognito-identity-provider";
import { isNotFoundError } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";
import { NOT_AVAILABLE } from "#shared/constants.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { DELETION_PROTECTION_ERROR, LIST_POOLS_PAGE_SIZE } from "#services/cognito/constants.ts";
import { toUpdateUserPoolInput } from "#services/cognito/poolUpdate.ts";
import { toCreateUserPoolInput, type CreatePoolForm } from "#services/cognito/schemas.ts";
import { triggerLabelsOf } from "#services/cognito/triggers.ts";

export type PoolChange = Partial<UpdateUserPoolRequest>;

// Mỗi dòng = một loại trigger của một pool trỏ tới function
export interface PoolTrigger {
  poolId: string;
  poolName: string;
  label: string;
}

const USER_NOT_FOUND_ERROR = "UserNotFoundException";
const NO_POOL_ERROR = "Cognito returned no pool";

export const isCognitoMissing = (error: unknown) =>
  isNotFoundError(error) || (error instanceof Error && error.name === USER_NOT_FOUND_ERROR);

export const listUserPools = (cognito: CognitoIdentityProviderClient) =>
  collectPages(
    paginateListUserPools({ client: cognito }, { MaxResults: LIST_POOLS_PAGE_SIZE }),
    (page) => page.UserPools,
  );

// ARN có version / alias cũng tính (triggerLabelsOf)
export async function listPoolTriggers(
  cognito: CognitoIdentityProviderClient,
  functionArn: string,
): Promise<PoolTrigger[]> {
  // Probe Floci 2.4.0 (2026-11-22): ListUserPools trả đủ LambdaConfig, không cần DescribeUserPool
  const pools = await listUserPools(cognito);

  return pools.flatMap(({ Id: poolId = "", Name: poolName = NOT_AVAILABLE, LambdaConfig }) =>
    triggerLabelsOf(LambdaConfig, functionArn).map((label) => ({ poolId, poolName, label })),
  );
}

// Floci không dọn trigger của pool khi xóa function: đăng ký / đăng nhập ở pool đó sẽ lỗi
// (UnexpectedLambdaException), nên cảnh báo trước khi xóa
export async function listTriggerUses(
  cognito: CognitoIdentityProviderClient,
  functions: readonly { name: string; arn: string }[],
) {
  const uses = await Promise.all(
    functions.map(async ({ name, arn }) =>
      (await listPoolTriggers(cognito, arn)).map((trigger) => ({ ...trigger, fn: name })),
    ),
  );
  return uses.flat();
}

export async function getUserPool(cognito: CognitoIdentityProviderClient, poolId: string) {
  const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
  if (!UserPool) throw new Error(NO_POOL_ERROR);
  return UserPool;
}

export async function createUserPool(cognito: CognitoIdentityProviderClient, form: CreatePoolForm) {
  const { UserPool } = await cognito.send(new CreateUserPoolCommand(toCreateUserPoolInput(form)));
  if (!UserPool?.Id) throw new Error("Cognito returned no pool ID");
  return UserPool.Id;
}

export async function deleteUserPool(cognito: CognitoIdentityProviderClient, poolId = "") {
  const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
  // Kiểm tra trước khi xóa domain: xóa pool thất bại thì domain không được mất
  if (UserPool?.DeletionProtection === DeletionProtectionType.ACTIVE)
    throw new Error(DELETION_PROTECTION_ERROR);

  // AWS không cho xóa pool còn domain: xóa domain trước
  if (UserPool?.Domain)
    await cognito.send(
      new DeleteUserPoolDomainCommand({ UserPoolId: poolId, Domain: UserPool.Domain }),
    );

  await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
}

export const deleteUserPools = (
  cognito: CognitoIdentityProviderClient,
  pools: readonly UserPoolDescriptionType[],
) =>
  runEach(
    pools,
    (pool) => pool.Name ?? NOT_AVAILABLE,
    (pool) => deleteUserPool(cognito, pool.Id),
  );

// Gộp vào DescribeUserPool mới nhất vì AWS reset trường không gửi; change dạng hàm khi cần đọc pool mới nhất
export async function updateUserPool(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  change: PoolChange | ((fresh: UserPoolType) => PoolChange),
) {
  const pool = await getUserPool(cognito, poolId);
  const update = typeof change === "function" ? change(pool) : change;
  await cognito.send(new UpdateUserPoolCommand(toUpdateUserPoolInput(pool, update)));
}

export async function createDomain(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  domain: string,
) {
  await cognito.send(new CreateUserPoolDomainCommand({ UserPoolId: poolId, Domain: domain }));
}

export async function deleteDomain(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  domain: string,
) {
  await cognito.send(new DeleteUserPoolDomainCommand({ UserPoolId: poolId, Domain: domain }));
}
