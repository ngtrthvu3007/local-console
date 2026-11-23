import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LAMBDA_QUERY_ROOT } from "../../lambda/hooks/useFunctions.ts";
import { DELETION_PROTECTION_ERROR, LIST_POOLS_PAGE_SIZE } from "../constants.ts";
import { toUpdateUserPoolInput } from "../poolUpdate.ts";
import { toCreateUserPoolInput, type CreatePoolForm } from "../schemas.ts";
import { triggerLabelsOf } from "../triggers.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

export const poolsQueryKey = [COGNITO_QUERY_ROOT, "pools"];
export const poolQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "pool", poolId];
const NO_POOL_ERROR = "Cognito returned no pool";

async function listUserPools(client: CognitoIdentityProviderClient) {
  const pools: UserPoolDescriptionType[] = [];
  for await (const page of paginateListUserPools({ client }, { MaxResults: LIST_POOLS_PAGE_SIZE }))
    pools.push(...(page.UserPools ?? []));
  return pools;
}

export function useUserPools() {
  const client = useCognito();
  return useQuery({ queryKey: poolsQueryKey, queryFn: () => listUserPools(client) });
}

// Mỗi dòng = một loại trigger của một pool trỏ tới function
export type PoolTrigger = { poolId: string; poolName: string; label: string };

// Lambda › Triggers dùng; ARN có version / alias cũng tính (triggerLabelsOf)
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

export function useUserPool(poolId: string) {
  const client = useCognito();
  return useQuery({
    queryKey: poolQueryKey(poolId),
    retry: false,
    queryFn: async () => {
      const { UserPool } = await client.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
      if (!UserPool) throw new Error(NO_POOL_ERROR);
      return UserPool;
    },
  });
}

export function useCreateUserPool() {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: CreatePoolForm) => {
      const { UserPool } = await client.send(
        new CreateUserPoolCommand(toCreateUserPoolInput(form)),
      );
      if (!UserPool?.Id) throw new Error("Cognito returned no pool ID");
      return UserPool.Id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolsQueryKey }),
  });
}

export async function deleteUserPool(client: CognitoIdentityProviderClient, poolId = "") {
  const { UserPool } = await client.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
  // Kiểm tra trước khi xóa domain: xóa pool thất bại thì domain không được mất
  if (UserPool?.DeletionProtection === DeletionProtectionType.ACTIVE)
    throw new Error(DELETION_PROTECTION_ERROR);
  // AWS không cho xóa pool còn domain: xóa domain trước
  if (UserPool?.Domain)
    await client.send(
      new DeleteUserPoolDomainCommand({ UserPoolId: poolId, Domain: UserPool.Domain }),
    );
  await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
}

export function useDeleteUserPools() {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pools: UserPoolDescriptionType[]) =>
      runEach(
        pools,
        (pool) => pool.Name ?? NOT_AVAILABLE,
        (pool) => deleteUserPool(client, pool.Id),
      ),
    // Pool bị xóa thì trigger của Lambda trỏ tới nó cũng đổi
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: poolsQueryKey }),
        queryClient.invalidateQueries({ queryKey: [LAMBDA_QUERY_ROOT] }),
      ]),
  });
}

type PoolChange = Partial<UpdateUserPoolRequest>;

// Gộp vào DescribeUserPool mới nhất: AWS reset trường không gửi (poolUpdate.ts).
// change dạng hàm khi chính thay đổi cần đọc pool mới nhất (vd LambdaConfig giữ key ngoài form)
export function useUpdateUserPool(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation<void, Error, PoolChange | ((fresh: UserPoolType) => PoolChange)>({
    mutationFn: async (change) => {
      const { UserPool } = await client.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
      if (!UserPool) throw new Error(NO_POOL_ERROR);
      const update = typeof change === "function" ? change(UserPool) : change;
      await client.send(new UpdateUserPoolCommand(toUpdateUserPoolInput(UserPool, update)));
    },
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
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (domain) => {
      await client.send(new CreateUserPoolDomainCommand({ UserPoolId: poolId, Domain: domain }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolQueryKey(poolId) }),
  });
}

export function useDeleteDomain(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (domain) => {
      await client.send(new DeleteUserPoolDomainCommand({ UserPoolId: poolId, Domain: domain }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolQueryKey(poolId) }),
  });
}
