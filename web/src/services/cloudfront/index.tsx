import { Navigate } from "react-router";
import { IconWorldWww } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  CLOUDFRONT_ROUTE_PATTERNS,
  CLOUDFRONT_SERVICE_ID,
  cloudfrontRoutes,
} from "@localconsole/core/cloudfront";

export const cloudfrontService: ServiceDefinition = {
  id: CLOUDFRONT_SERVICE_ID,
  name: "CloudFront",
  fullName: "Amazon CloudFront",
  description: "Distributions in front of S3: local URL, origins, behaviors, invalidations",
  icon: IconWorldWww,
  category: "networking",
  navigation: [{ text: "Distributions", href: cloudfrontRoutes.distributions }],
  routes: [
    { index: true, element: <Navigate to={cloudfrontRoutes.distributions} replace /> },
    {
      path: CLOUDFRONT_ROUTE_PATTERNS.distributions,
      ...lazyPage(() => import("./pages/DistributionList.tsx"), "DistributionList"),
    },
    {
      path: CLOUDFRONT_ROUTE_PATTERNS.createDistribution,
      ...lazyPage(() => import("./pages/CreateDistribution.tsx"), "CreateDistribution"),
    },
    {
      path: CLOUDFRONT_ROUTE_PATTERNS.distribution,
      ...lazyPage(() => import("./pages/DistributionDetail.tsx"), "DistributionDetail"),
    },
  ],
};
