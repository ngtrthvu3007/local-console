import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useClusters } from "./hooks/useClusters.ts";
import { ClusterDetail } from "./pages/ClusterDetail.tsx";
import { ClusterList } from "./pages/ClusterList.tsx";
import { CreateCluster } from "./pages/CreateCluster.tsx";
import { ELASTICACHE_ROUTE_PATTERNS, ELASTICACHE_SERVICE_ID, elasticacheRoutes } from "./routes.ts";

export const elasticacheService: ServiceDefinition = {
  id: ELASTICACHE_SERVICE_ID,
  name: "ElastiCache",
  fullName: "Amazon ElastiCache",
  description: "Valkey and Redis OSS caches: endpoints, keys and values",
  iconPath: "/icons/elasticache.svg",
  navigation: [{ text: "Clusters", href: elasticacheRoutes.clusters }],
  quickLinks: [{ text: "Create cluster", href: elasticacheRoutes.createCluster }],
  routes: [
    { index: true, element: <Navigate to={elasticacheRoutes.clusters} replace /> },
    { path: ELASTICACHE_ROUTE_PATTERNS.clusters, element: <ClusterList /> },
    { path: ELASTICACHE_ROUTE_PATTERNS.createCluster, element: <CreateCluster /> },
    { path: ELASTICACHE_ROUTE_PATTERNS.cluster, element: <ClusterDetail /> },
  ],
  useResourceCount: () => ({ count: useClusters().data?.length, noun: "cluster" }),
};
