import {
  CreateIdentityProviderCommand,
  DeleteIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  UpdateIdentityProviderCommand,
  paginateListIdentityProviders,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { LIST_PROVIDERS_PAGE_SIZE } from "#services/cognito/constants.ts";
import { toProviderFields, type ProviderForm } from "#services/cognito/schemas.ts";

export async function getProvider(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  name: string,
) {
  const { IdentityProvider } = await cognito.send(
    new DescribeIdentityProviderCommand({ UserPoolId: poolId, ProviderName: name }),
  );
  if (!IdentityProvider) throw new Error("Cognito returned no identity provider");
  return IdentityProvider;
}

export const listProviders = (cognito: CognitoIdentityProviderClient, poolId: string) =>
  collectPages(
    paginateListIdentityProviders(
      { client: cognito },
      { UserPoolId: poolId, MaxResults: LIST_PROVIDERS_PAGE_SIZE },
    ),
    (page) => page.Providers,
  );

export async function createProvider(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  form: ProviderForm,
) {
  await cognito.send(
    new CreateIdentityProviderCommand({ UserPoolId: poolId, ...toProviderFields(form) }),
  );
}

export async function updateProvider(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  form: ProviderForm,
) {
  const { ProviderName, ProviderDetails, AttributeMapping } = toProviderFields(form);
  // Floci thay cả ProviderDetails bằng bản gửi lên: gộp Describe mới nhất để giữ khóa ngoài form
  const current = await getProvider(cognito, poolId, ProviderName);

  await cognito.send(
    new UpdateIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName,
      ProviderDetails: { ...current.ProviderDetails, ...ProviderDetails },
      AttributeMapping,
    }),
  );

  return ProviderName;
}

export const deleteProviders = (
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  names: readonly string[],
) =>
  runEach(
    names,
    (name) => name,
    (name) =>
      cognito.send(new DeleteIdentityProviderCommand({ UserPoolId: poolId, ProviderName: name })),
  );
