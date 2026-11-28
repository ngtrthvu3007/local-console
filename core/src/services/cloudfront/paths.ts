import { fillPath } from "#shared/utils/paths.ts";

export const CLOUDFRONT_SERVICE_ID = "cloudfront";
const CLOUDFRONT_ROOT = `/${CLOUDFRONT_SERVICE_ID}`;

export const DISTRIBUTION_TABS = {
  general: "general",
  origins: "origins",
  behaviors: "behaviors",
  invalidations: "invalidations",
} as const;
export type DistributionTab = (typeof DISTRIBUTION_TABS)[keyof typeof DISTRIBUTION_TABS];

export const SEARCH_PARAMS = { tab: "tab", bucket: "bucket" } as const;

export const CLOUDFRONT_ROUTE_PATTERNS = {
  distributions: "distributions",
  createDistribution: "distributions/create",
  distribution: "distributions/:distributionId",
} as const;

const fullPath = (pattern: string) => `${CLOUDFRONT_ROOT}/${pattern}`;

const withParam = (path: string, name: string, value?: string) =>
  value ? `${path}?${new URLSearchParams({ [name]: value })}` : path;

export const cloudfrontRoutes = {
  distributions: fullPath(CLOUDFRONT_ROUTE_PATTERNS.distributions),
  createDistribution: (bucket?: string) =>
    withParam(fullPath(CLOUDFRONT_ROUTE_PATTERNS.createDistribution), SEARCH_PARAMS.bucket, bucket),
  distribution: (distributionId: string, tab?: DistributionTab) =>
    withParam(
      fillPath(fullPath(CLOUDFRONT_ROUTE_PATTERNS.distribution), { distributionId }),
      SEARCH_PARAMS.tab,
      tab === DISTRIBUTION_TABS.general ? undefined : tab,
    ),
};
