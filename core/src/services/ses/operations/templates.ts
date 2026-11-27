import {
  DeleteEmailTemplateCommand,
  GetEmailTemplateCommand,
  paginateListEmailTemplates,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";

export const listTemplates = (ses: SESv2Client) =>
  collectPages(paginateListEmailTemplates({ client: ses }, {}), (page) => page.TemplatesMetadata);

export const getTemplate = async (ses: SESv2Client, name: string) =>
  (await ses.send(new GetEmailTemplateCommand({ TemplateName: name }))).TemplateContent ?? {};

export const deleteTemplates = (ses: SESv2Client, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => ses.send(new DeleteEmailTemplateCommand({ TemplateName: name })),
  );
