import { cloudfrontRoutes } from "@localconsole/core/cloudfront";

export const cloudfrontBaseCrumbs = [
  { text: "Amazon CloudFront", href: cloudfrontRoutes.distributions },
  { text: "Distributions", href: cloudfrontRoutes.distributions },
];

export const distributionCrumbs = (distributionId: string) => [
  ...cloudfrontBaseCrumbs,
  { text: distributionId, href: cloudfrontRoutes.distribution(distributionId) },
];
