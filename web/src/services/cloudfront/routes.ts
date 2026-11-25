import { generatePath } from "react-router";

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

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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
  // Từ trang bucket: điền sẵn bucket
  createDistribution: (bucket?: string) =>
    withParam(fullPath(CLOUDFRONT_ROUTE_PATTERNS.createDistribution), SEARCH_PARAMS.bucket, bucket),
  // Tab mặc định (General) không ghi lên URL
  distribution: (distributionId: string, tab?: DistributionTab) =>
    withParam(
      generatePath(fullPath(CLOUDFRONT_ROUTE_PATTERNS.distribution), { distributionId }),
      SEARCH_PARAMS.tab,
      tab === DISTRIBUTION_TABS.general ? undefined : tab,
    ),
};

export const cloudfrontBaseCrumbs = [
  { text: "Amazon CloudFront", href: cloudfrontRoutes.distributions },
  { text: "Distributions", href: cloudfrontRoutes.distributions },
];

export const distributionCrumbs = (distributionId: string) => [
  ...cloudfrontBaseCrumbs,
  { text: distributionId, href: cloudfrontRoutes.distribution(distributionId) },
];
