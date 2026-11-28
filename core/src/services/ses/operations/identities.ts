import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  paginateListEmailIdentities,
  PutEmailIdentityConfigurationSetAttributesCommand,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";

export const listIdentities = (ses: SESv2Client) =>
  collectPages(paginateListEmailIdentities({ client: ses }, {}), (page) => page.EmailIdentities);

export async function createIdentity(ses: SESv2Client, email: string) {
  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
}

export const deleteIdentities = (ses: SESv2Client, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: name })),
  );

// "" = chưa có set mặc định (react-query không nhận kết quả undefined)
export const getIdentityConfigurationSet = async (ses: SESv2Client, name: string) =>
  (await ses.send(new GetEmailIdentityCommand({ EmailIdentity: name }))).ConfigurationSetName ?? "";

// Không có configurationSet = gỡ set mặc định
export const setIdentityConfigurationSet = (
  ses: SESv2Client,
  { identity, configurationSet }: { identity: string; configurationSet?: string },
) =>
  ses.send(
    new PutEmailIdentityConfigurationSetAttributesCommand({
      EmailIdentity: identity,
      ConfigurationSetName: configurationSet,
    }),
  );
