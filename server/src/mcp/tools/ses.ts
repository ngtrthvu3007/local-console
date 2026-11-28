import { z } from "zod";
import {
  ADD_DESTINATION_DEFAULTS,
  addDestinationSchema,
  addEmailSchema,
  createConfigurationSetSchema,
  type Email,
  matchesSearch,
  needsMimeFields,
  SEARCH_PARAMS,
  SES_SERVICE_ID,
  sesRoutes,
  type SesService,
  setConfigurationSetSchema,
  withMimeFields,
} from "@localconsole/core/ses";
import { withQuery } from "@localconsole/core/shared";
import { APP_DATA_WARNING, LIST_METHOD } from "../constants.ts";
import { formInput, pageShape, requiredUnlessList } from "../input.ts";
import { bulkResult, ok, page, truncateText } from "../result.ts";
import {
  CREATES,
  defineTool,
  DESTROYS,
  READ_ONLY,
  UPDATES,
  type ToolContext,
  type ToolGroup,
} from "../tool.ts";

const readMethod = z.enum([LIST_METHOD, "get"]);
const names = (label: string) =>
  z.array(z.string().trim().min(1)).min(1).describe(`${label} names.`);
const configurationSetName = z.string().trim().min(1, "Enter a configuration set name.");

const emailUrl = ({ consoleUrl }: ToolContext, id?: string) =>
  consoleUrl(withQuery(sesRoutes.mailbox, { [SEARCH_PARAMS.email]: id }));
const templateUrl = ({ consoleUrl }: ToolContext, name?: string) =>
  consoleUrl(withQuery(sesRoutes.templates, { [SEARCH_PARAMS.template]: name }));
const setUrl = ({ consoleUrl }: ToolContext, name?: string) =>
  consoleUrl(name ? sesRoutes.configurationSetPage(name) : sesRoutes.configurationSets);

const optionalText = (text?: string) => {
  if (text === undefined) return {};
  const short = truncateText(text);
  return { text: short.text, ...(short.truncated && { truncated: true }) };
};

// Như useMimeFields của UI: mail SendRawEmail chỉ có subject / người nhận sau khi đọc MIME
const withListFields = async (ses: SesService, email: Email) =>
  needsMimeFields(email) ? withMimeFields(email, await ses.readEmail(email)) : email;

// Danh sách giống cột của hộp thư: bỏ RawData / Body / Headers (đọc bằng method get)
const emailSummary = ({ RawData: _raw, Body: _body, Headers: _headers, ...summary }: Email) =>
  summary;

const readEmail = defineTool({
  name: "ses_read_email",
  description: `Reads the emails apps sent through SES (Floci keeps them instead of delivering). method list: newest first, filtered by search (recipient, sender or subject); get: one email with its HTML, text, headers and attachment names. ${APP_DATA_WARNING}`,
  inputSchema: z
    .object({
      method: readMethod,
      id: z.string().trim().optional().describe("Email id from list. Required for get."),
      search: z.string().default("").describe("Recipient, sender or subject contains this text."),
      ...pageShape,
    })
    .superRefine(requiredUnlessList("id")),
  annotations: READ_ONLY,
  handler: async ({ method, id, search, limit, nextToken }, context) => {
    const { ses } = context.services;
    const emails = await ses.listEmails();

    if (method === LIST_METHOD) {
      const listed = await Promise.all(emails.map((email) => withListFields(ses, email)));
      const matching = listed.filter((email) => matchesSearch(email, search)).map(emailSummary);
      return ok(page(matching, limit, nextToken), emailUrl(context));
    }

    const email = emails.find((candidate) => candidate.Id === id);
    if (!email) throw new Error(`Email ${id} doesn't exist.`);
    // Mail bị chặn không có nội dung, UI cũng chỉ hiện lý do
    if (email.RejectReason) return ok(emailSummary(email), emailUrl(context, id));
    const { html, text, attachments, ...content } = await ses.readEmail(email);

    return ok(
      {
        ...content,
        html: optionalText(html),
        text: optionalText(text),
        attachments: attachments.map(({ fileName, mimeType }) => ({ fileName, mimeType })),
      },
      emailUrl(context, id),
    );
  },
});

const readIdentity = defineTool({
  name: "ses_read_identity",
  description:
    "Reads SES verified identities (sender email addresses) with their default configuration set. method list: every identity; get: one identity.",
  inputSchema: z
    .object({
      method: readMethod,
      name: z.string().trim().optional().describe("Identity (email address). Required for get."),
      ...pageShape,
    })
    .superRefine(requiredUnlessList("name")),
  annotations: READ_ONLY,
  handler: async ({ method, name, limit, nextToken }, context) => {
    const { ses } = context.services;
    const url = context.consoleUrl(sesRoutes.identities);
    const withSet = async (identity: string) => ({
      configurationSet: await ses.getIdentityConfigurationSet(identity),
    });

    if (method === "get") {
      const identity = (await ses.listIdentities()).find((item) => item.IdentityName === name);
      if (!identity) throw new Error(`Identity ${name} doesn't exist.`);
      return ok({ ...identity, ...(await withSet(name!)) }, url);
    }

    const { items, ...rest } = page(await ses.listIdentities(), limit, nextToken);
    const withSets = await Promise.all(
      items.map(async (identity) => ({
        ...identity,
        ...(await withSet(identity.IdentityName ?? "")),
      })),
    );
    return ok({ ...rest, items: withSets }, url);
  },
});

const readTemplate = defineTool({
  name: "ses_read_template",
  description:
    "Reads SES email templates. method list: every template; get: subject, HTML and text of one template.",
  inputSchema: z
    .object({
      method: readMethod,
      name: z.string().trim().optional().describe("Template name. Required for get."),
      ...pageShape,
    })
    .superRefine(requiredUnlessList("name")),
  annotations: READ_ONLY,
  handler: async ({ method, name, limit, nextToken }, context) => {
    const { ses } = context.services;
    if (method === LIST_METHOD)
      return ok(page(await ses.listTemplates(), limit, nextToken), templateUrl(context));

    const { Html, Text, ...template } = await ses.getTemplate(name!);
    return ok(
      { name, ...template, html: optionalText(Html), text: optionalText(Text) },
      templateUrl(context, name),
    );
  },
});

const readConfigurationSet = defineTool({
  name: "ses_read_configuration_set",
  description:
    "Reads SES configuration sets with their event destinations (SNS topic or event bus that receives send / delivery / bounce / complaint events). method list: every set; get: one set.",
  inputSchema: z
    .object({
      method: readMethod,
      name: z.string().trim().optional().describe("Configuration set name. Required for get."),
      ...pageShape,
    })
    .superRefine(requiredUnlessList("name")),
  annotations: READ_ONLY,
  handler: async ({ method, name, limit, nextToken }, context) => {
    const { ses } = context.services;
    const withDestinations = async (set: string) => ({
      name: set,
      eventDestinations: await ses.listEventDestinations(set),
    });

    if (method === "get") return ok(await withDestinations(name!), setUrl(context, name));

    const { items, ...rest } = page(await ses.listConfigurationSets(), limit, nextToken);
    return ok({ ...rest, items: await Promise.all(items.map(withDestinations)) }, setUrl(context));
  },
});

const deleteEmail = defineTool({
  name: "ses_delete_email",
  description:
    "Deletes emails from the local SES mailbox. Without id, deletes every email of this region.",
  inputSchema: z.object({
    id: z.string().trim().optional().describe("Email id from ses_read_email."),
  }),
  annotations: DESTROYS,
  handler: async ({ id }, context) => {
    const { ses } = context.services;
    // Như "Delete all" của UI: xóa từng mail của region (DELETE không id xóa cả region khác)
    const ids = id ? [id] : (await ses.listEmails()).map((email) => email.Id);
    return bulkResult(await ses.deleteEmails(ids), emailUrl(context));
  },
});

const createIdentity = defineTool({
  name: "ses_create_identity",
  description:
    "Adds a verified email identity to SES so apps can send from it (verified at once on Floci).",
  inputSchema: addEmailSchema,
  annotations: CREATES,
  handler: async ({ email }, context) => {
    await context.services.ses.createIdentity(email);
    return ok({ identity: email }, context.consoleUrl(sesRoutes.identities));
  },
});

const setIdentityConfigurationSet = defineTool({
  name: "ses_set_identity_configuration_set",
  description:
    "Sets the default configuration set of an SES identity, so its emails send events to that set's destinations. An empty configurationSet removes it.",
  inputSchema: setConfigurationSetSchema.extend({
    identity: z.string().trim().min(1).describe("Identity (email address)."),
  }),
  annotations: UPDATES,
  handler: async ({ identity, configurationSet }, context) => {
    await context.services.ses.setIdentityConfigurationSet({
      identity,
      configurationSet: configurationSet || undefined,
    });
    return ok({ identity, configurationSet }, context.consoleUrl(sesRoutes.identities));
  },
});

const deleteIdentity = defineTool({
  name: "ses_delete_identity",
  description: "Deletes SES identities; apps can no longer send from them.",
  inputSchema: z.object({ names: names("Identity") }),
  annotations: DESTROYS,
  handler: async ({ names: identities }, context) =>
    bulkResult(
      await context.services.ses.deleteIdentities(identities),
      context.consoleUrl(sesRoutes.identities),
    ),
});

const deleteTemplate = defineTool({
  name: "ses_delete_template",
  description: "Deletes SES email templates.",
  inputSchema: z.object({ names: names("Template") }),
  annotations: DESTROYS,
  handler: async ({ names: templates }, context) =>
    bulkResult(await context.services.ses.deleteTemplates(templates), templateUrl(context)),
});

const createConfigurationSet = defineTool({
  name: "ses_create_configuration_set",
  description: "Creates an SES configuration set. Add destinations with ses_put_event_destination.",
  inputSchema: createConfigurationSetSchema,
  annotations: CREATES,
  handler: async ({ name }, context) => {
    await context.services.ses.createConfigurationSet(name);
    return ok({ name }, setUrl(context, name));
  },
});

const putEventDestination = defineTool({
  name: "ses_put_event_destination",
  description:
    "Creates or replaces an event destination of an SES configuration set: an SNS topic (kind sns) or the default event bus (kind eventbus) that receives the chosen event types. A destination with the same name is replaced.",
  inputSchema: formInput(addDestinationSchema, ADD_DESTINATION_DEFAULTS, {
    configurationSet: configurationSetName,
  }),
  annotations: UPDATES,
  handler: async ({ configurationSet, name, ...input }, context) => {
    const { ses } = context.services;
    const existing = await ses.listEventDestinations(configurationSet);
    const change = { set: configurationSet, name, input };

    if (existing.some((destination) => destination.Name === name))
      await ses.updateEventDestination(change);
    else await ses.addEventDestination(change);

    return ok(
      { name, eventDestinations: await ses.listEventDestinations(configurationSet) },
      setUrl(context, configurationSet),
    );
  },
});

const deleteConfigurationSet = defineTool({
  name: "ses_delete_configuration_set",
  description: "Deletes SES configuration sets and their event destinations.",
  inputSchema: z.object({ names: names("Configuration set") }),
  annotations: DESTROYS,
  handler: async ({ names: sets }, context) =>
    bulkResult(await context.services.ses.deleteConfigurationSets(sets), setUrl(context)),
});

const deleteEventDestination = defineTool({
  name: "ses_delete_event_destination",
  description: "Deletes one event destination of an SES configuration set.",
  inputSchema: z.object({
    configurationSet: configurationSetName,
    name: z.string().trim().min(1).describe("Destination name."),
  }),
  annotations: DESTROYS,
  handler: async ({ configurationSet, name }, context) => {
    await context.services.ses.deleteEventDestination(configurationSet, name);
    return ok({ deleted: name }, setUrl(context, configurationSet));
  },
});

export const SES_TOOLS: ToolGroup = {
  id: SES_SERVICE_ID,
  tools: [
    readEmail,
    readIdentity,
    readTemplate,
    readConfigurationSet,
    deleteEmail,
    createIdentity,
    setIdentityConfigurationSet,
    deleteIdentity,
    deleteTemplate,
    createConfigurationSet,
    putEventDestination,
    deleteConfigurationSet,
    deleteEventDestination,
  ],
};
