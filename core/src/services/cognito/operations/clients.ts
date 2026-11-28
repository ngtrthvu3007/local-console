import {
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  paginateListUserPoolClients,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { LIST_CLIENTS_PAGE_SIZE } from "#services/cognito/constants.ts";
import { toUpdateUserPoolClientInput } from "#services/cognito/poolUpdate.ts";
import { toClientFields, type ClientForm } from "#services/cognito/schemas.ts";

const NO_CLIENT_ERROR = "Cognito returned no app client";

export async function getClient(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  clientId: string,
) {
  const { UserPoolClient } = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }),
  );
  if (!UserPoolClient) throw new Error(NO_CLIENT_ERROR);
  return UserPoolClient;
}

// List không có ClientSecret nên Describe từng client song song
export async function listClients(cognito: CognitoIdentityProviderClient, poolId: string) {
  const clients = await collectPages(
    paginateListUserPoolClients(
      { client: cognito },
      { UserPoolId: poolId, MaxResults: LIST_CLIENTS_PAGE_SIZE },
    ),
    (page) => page.UserPoolClients,
  );
  const ids = clients.flatMap((item) => (item.ClientId ? [item.ClientId] : []));
  return Promise.all(ids.map((id) => getClient(cognito, poolId, id)));
}

export async function createClient(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  form: ClientForm,
) {
  const { UserPoolClient } = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      GenerateSecret: form.generateSecret,
      ...toClientFields(form),
    }),
  );
  if (!UserPoolClient?.ClientId) throw new Error(NO_CLIENT_ERROR);
  return UserPoolClient.ClientId;
}

export async function updateClient(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  clientId: string,
  form: ClientForm,
) {
  // Describe mới để không ghi đè trường ngoài form (token validity...) bằng bản cũ
  const current = await getClient(cognito, poolId, clientId);

  // Bỏ hết flow thì phải gửi [] rõ ràng, nếu không giá trị cũ của client được giữ lại
  await cognito.send(
    new UpdateUserPoolClientCommand(
      toUpdateUserPoolClientInput(current, {
        AllowedOAuthFlows: [],
        AllowedOAuthScopes: [],
        ...toClientFields(form),
      }),
    ),
  );
}

export const deleteClients = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  clientIds: readonly string[],
) =>
  runEach(
    clientIds,
    (clientId) => clientId,
    (clientId) =>
      cognito.send(new DeleteUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })),
  );
