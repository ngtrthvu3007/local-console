export const SES_SERVICE_ID = "ses";
const SES_ROOT = `/${SES_SERVICE_ID}`;

export const SES_ROUTE_PATTERNS = {
  mailbox: "mailbox",
  identities: "identities",
  templates: "templates",
} as const;

// email, template: mail / template đang mở trong panel
export const SEARCH_PARAMS = { email: "email", template: "template" } as const;

const fullPath = (pattern: string) => `${SES_ROOT}/${pattern}`;

export const sesRoutes = {
  mailbox: fullPath(SES_ROUTE_PATTERNS.mailbox),
  identities: fullPath(SES_ROUTE_PATTERNS.identities),
  templates: fullPath(SES_ROUTE_PATTERNS.templates),
};

export const sesBaseCrumbs = [{ text: "Amazon SES", href: sesRoutes.mailbox }];
