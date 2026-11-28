import { Navigate } from "react-router";
import { IconBolt } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  ELASTICACHE_ROUTE_PATTERNS,
  ELASTICACHE_SERVICE_ID,
  elasticacheRoutes,
} from "@localconsole/core/elasticache";

export const elasticacheService: ServiceDefinition = {
  id: ELASTICACHE_SERVICE_ID,
  name: "ElastiCache",
  fullName: "Amazon ElastiCache",
  description: "Valkey and Redis OSS caches: endpoints, keys and values",
  icon: IconBolt,
  category: "database",
  navigation: [{ text: "Clusters", href: elasticacheRoutes.clusters }],
  routes: [
    {
      index: true,
      element: <Navigate to={elasticacheRoutes.clusters} replace />,
    },
    {
      path: ELASTICACHE_ROUTE_PATTERNS.clusters,
      ...lazyPage(() => import("./pages/ClusterList.tsx"), "ClusterList"),
    },
    {
      path: ELASTICACHE_ROUTE_PATTERNS.createCluster,
      ...lazyPage(() => import("./pages/CreateCluster.tsx"), "CreateCluster"),
    },
    {
      path: ELASTICACHE_ROUTE_PATTERNS.cluster,
      ...lazyPage(() => import("./pages/ClusterDetail.tsx"), "ClusterDetail"),
    },
  ],
};
