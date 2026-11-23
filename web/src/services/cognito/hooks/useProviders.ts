import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateIdentityProviderCommand,
  DeleteIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  UpdateIdentityProviderCommand,
  paginateListIdentityProviders,
  type CognitoIdentityProviderClient,
  type ProviderDescription,
} from "@aws-sdk/client-cognito-identity-provider";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LIST_PROVIDERS_PAGE_SIZE } from "../constants.ts";
import { toProviderFields, type ProviderForm } from "../schemas.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

export const providersQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "providers", poolId];
const providerQueryKey = (poolId: string, name: string) => [COGNITO_QUERY_ROOT, "provider", poolId, name];

async function describeProvider(client: CognitoIdentityProviderClient, poolId: string, name: string) {
  const { IdentityProvider } = await client.send(
    new DescribeIdentityProviderCommand({ UserPoolId: poolId, ProviderName: name }),
  );
  if (!IdentityProvider) throw new Error("Cognito returned no identity provider");
  return IdentityProvider;
}

export function useProviders(poolId: string) {
  const client = useCognito();
  return useQuery({
    queryKey: providersQueryKey(poolId),
    queryFn: async () => {
      const providers: ProviderDescription[] = [];
      for await (const page of paginateListIdentityProviders(
        { client },
        { UserPoolId: poolId, MaxResults: LIST_PROVIDERS_PAGE_SIZE },
      ))
        providers.push(...(page.Providers ?? []));
      return providers;
    },
  });
}

export function useProvider(poolId: string, name: string) {
  const client = useCognito();
  return useQuery({
    queryKey: providerQueryKey(poolId, name),
    retry: false,
    // Trang tạo không có tên: không gọi Describe với tên rỗng
    enabled: Boolean(name),
    queryFn: () => describeProvider(client, poolId, name),
  });
}

export function useCreateProvider(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: ProviderForm) => {
      await client.send(new CreateIdentityProviderCommand({ UserPoolId: poolId, ...toProviderFields(form) }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
  });
}

export function useUpdateProvider(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: ProviderForm) => {
      const { ProviderName, ProviderDetails, AttributeMapping } = toProviderFields(form);
      // Floci thay cả ProviderDetails bằng bản gửi lên: gộp Describe mới nhất để giữ khóa ngoài form
      const current = await describeProvider(client, poolId, ProviderName);
      await client.send(
        new UpdateIdentityProviderCommand({
          UserPoolId: poolId,
          ProviderName,
          ProviderDetails: { ...current.ProviderDetails, ...ProviderDetails },
          AttributeMapping,
        }),
      );
      return ProviderName;
    },
    onSuccess: (name) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: providerQueryKey(poolId, name) }),
      ]),
  });
}

export function useDeleteProviders(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) =>
      runEach(
        names,
        (name) => name,
        (name) => client.send(new DeleteIdentityProviderCommand({ UserPoolId: poolId, ProviderName: name })),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey(poolId) }),
  });
}
