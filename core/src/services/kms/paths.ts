import { TAB_PARAM, withQuery } from "#shared/utils/paths.ts";

export const KMS_SERVICE_ID = "kms";
const KMS_ROOT = `/${KMS_SERVICE_ID}`;

export const KEY_TABS = {
  details: "details",
  aliases: "aliases",
  policy: "policy",
  tryIt: "try-it",
} as const;
export type KeyTab = (typeof KEY_TABS)[keyof typeof KEY_TABS];

// Key nằm trên query string: alias có "/" (như ?name= của Secrets Manager)
export const SEARCH_PARAMS = { key: "key", tab: "tab" } as const;

export const KMS_ROUTE_PATTERNS = {
  keys: "keys",
  awsKeys: "aws-keys",
  createKey: "keys/create",
  key: "keys/detail",
} as const;

const fullPath = (pattern: string) => `${KMS_ROOT}/${pattern}`;

export const kmsRoutes = {
  keys: fullPath(KMS_ROUTE_PATTERNS.keys),
  awsKeys: fullPath(KMS_ROUTE_PATTERNS.awsKeys),
  createKey: fullPath(KMS_ROUTE_PATTERNS.createKey),
  // key: ID, ARN key, tên alias hoặc ARN alias — DescribeKey tự phân giải
  key: (key: string, tab?: KeyTab) =>
    withQuery(fullPath(KMS_ROUTE_PATTERNS.key), {
      [SEARCH_PARAMS.key]: key,
      [TAB_PARAM]: tab === KEY_TABS.details ? undefined : tab,
    }),
};
