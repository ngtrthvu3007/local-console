import { fillPath, withTab } from "#shared/utils/paths.ts";

export const ELASTICACHE_SERVICE_ID = "elasticache";
const ELASTICACHE_ROOT = `/${ELASTICACHE_SERVICE_ID}`;

export const CLUSTER_TABS = { keys: "keys", details: "details" } as const;
export type ClusterTab = (typeof CLUSTER_TABS)[keyof typeof CLUSTER_TABS];

export const SEARCH_PARAMS = { key: "key" } as const;

export const ELASTICACHE_ROUTE_PATTERNS = {
  clusters: "clusters",
  createCluster: "clusters/create",
  cluster: "clusters/:cluster",
} as const;

const fullPath = (pattern: string) => `${ELASTICACHE_ROOT}/${pattern}`;

export const elasticacheRoutes = {
  clusters: fullPath(ELASTICACHE_ROUTE_PATTERNS.clusters),
  createCluster: fullPath(ELASTICACHE_ROUTE_PATTERNS.createCluster),
  cluster: (cluster: string, tab?: ClusterTab) =>
    withTab(
      fillPath(fullPath(ELASTICACHE_ROUTE_PATTERNS.cluster), { cluster }),
      tab,
      CLUSTER_TABS.keys,
    ),
};
