export const SES_SERVICE_ID = "ses";
const SES_ROOT = `/${SES_SERVICE_ID}`;

export const SES_ROUTE_PATTERNS = {
  mailbox: "mailbox",
  identities: "identities",
  templates: "templates",
  configurationSets: "configuration-sets",
} as const;

// email, template, configurationSet: mail / template / configuration set đang mở trong panel
export const SEARCH_PARAMS = {
  email: "email",
  template: "template",
  configurationSet: "set",
  search: "search", // điền sẵn ô tìm của hộp thư (link từ Cognito)
} as const;

const fullPath = (pattern: string) => `${SES_ROOT}/${pattern}`;

export const sesRoutes = {
  mailbox: fullPath(SES_ROUTE_PATTERNS.mailbox),
  identities: fullPath(SES_ROUTE_PATTERNS.identities),
  templates: fullPath(SES_ROUTE_PATTERNS.templates),
  configurationSets: fullPath(SES_ROUTE_PATTERNS.configurationSets),
  // Mở panel của một configuration set
  configurationSetPage: (name: string) =>
    `${fullPath(SES_ROUTE_PATTERNS.configurationSets)}?${new URLSearchParams({ [SEARCH_PARAMS.configurationSet]: name })}`,
};

export const sesBaseCrumbs = [{ text: "Amazon SES", href: sesRoutes.mailbox }];
