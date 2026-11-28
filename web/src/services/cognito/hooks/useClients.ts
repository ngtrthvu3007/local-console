import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  paginateListUserPoolClients,
  type UserPoolClientType,
} from "@aws-sdk/client-cognito-identity-provider";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LIST_CLIENTS_PAGE_SIZE } from "../constants.ts";
import { toUpdateUserPoolClientInput } from "../poolUpdate.ts";
import { toClientFields, type ClientForm } from "../schemas.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

const clientsQueryKey = (poolId: string) => [COGNITO_QUERY_ROOT, "clients", poolId];

const clientQueryKey = (poolId: string, clientId: string) => [
  COGNITO_QUERY_ROOT,
  "client",
  poolId,
  clientId,
];

async function describeClient(
  client: ReturnType<typeof useCognito>,
  poolId: string,
  clientId: string,
) {
  const { UserPoolClient } = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }),
  );

  if (!UserPoolClient) throw new Error("Cognito returned no app client");
  return UserPoolClient;
}

export function useClients(poolId: string) {
  const client = useCognito();

  return useQuery({
    queryKey: clientsQueryKey(poolId),
    queryFn: async () => {
      const ids: string[] = [];

      for await (const page of paginateListUserPoolClients(
        { client },
        { UserPoolId: poolId, MaxResults: LIST_CLIENTS_PAGE_SIZE },
      ))
        ids.push(
          ...(page.UserPoolClients ?? []).flatMap((item) => (item.ClientId ? [item.ClientId] : [])),
        );

      // List không có ClientSecret nên Describe từng client song song
      return Promise.all(ids.map((id) => describeClient(client, poolId, id)));
    },
  });
}

export function useClient(poolId: string, clientId: string) {
  const client = useCognito();

  return useQuery({
    queryKey: clientQueryKey(poolId, clientId),
    retry: false,
    // Trang tạo không có clientId: không gọi Describe với ID rỗng
    enabled: Boolean(clientId),
    queryFn: () => describeClient(client, poolId, clientId),
  });
}

export function useCreateClient(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (form: ClientForm) => {
      const { UserPoolClient } = await client.send(
        new CreateUserPoolClientCommand({
          UserPoolId: poolId,
          GenerateSecret: form.generateSecret,
          ...toClientFields(form),
        }),
      );

      if (!UserPoolClient?.ClientId) throw new Error("Cognito returned no app client");
      return UserPoolClient.ClientId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
  });
}

export function useUpdateClient(poolId: string, clientId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (form: ClientForm) => {
      // Describe mới để không ghi đè trường ngoài form (token validity...) bằng bản cũ
      const current: UserPoolClientType = await describeClient(client, poolId, clientId);

      // Bỏ hết flow thì phải gửi [] rõ ràng, nếu không giá trị cũ của client được giữ lại
      await client.send(
        new UpdateUserPoolClientCommand(
          toUpdateUserPoolClientInput(current, {
            AllowedOAuthFlows: [],
            AllowedOAuthScopes: [],
            ...toClientFields(form),
          }),
        ),
      );
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
        queryClient.invalidateQueries({ queryKey: clientQueryKey(poolId, clientId) }),
      ]),
  });
}

export function useDeleteClients(poolId: string) {
  const client = useCognito();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientIds: string[]) =>
      runEach(
        clientIds,
        (clientId) => clientId,
        (clientId) =>
          client.send(new DeleteUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })),
      ),
    // Chỉ làm mới danh sách: refetch chi tiết client vừa xóa sẽ nháy "not found"
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsQueryKey(poolId) }),
  });
}
