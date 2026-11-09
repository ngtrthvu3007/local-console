import { generatePath } from "react-router";

export const ELASTICACHE_SERVICE_ID = "elasticache";
const ELASTICACHE_ROOT = `/${ELASTICACHE_SERVICE_ID}`;

export const CLUSTER_TABS = { keys: "keys", details: "details" } as const;
export type ClusterTab = (typeof CLUSTER_TABS)[keyof typeof CLUSTER_TABS];

// key: key đang mở trong panel
export const SEARCH_PARAMS = { tab: "tab", key: "key" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const ELASTICACHE_ROUTE_PATTERNS = {
  clusters: "clusters",
  createCluster: "clusters/create",
  cluster: "clusters/:cluster",
} as const;

const fullPath = (pattern: string) => `${ELASTICACHE_ROOT}/${pattern}`;

export const elasticacheRoutes = {
  clusters: fullPath(ELASTICACHE_ROUTE_PATTERNS.clusters),
  createCluster: fullPath(ELASTICACHE_ROUTE_PATTERNS.createCluster),
  // Tab mặc định (Keys) không ghi lên URL
  cluster: (cluster: string, tab?: ClusterTab) => {
    const path = generatePath(fullPath(ELASTICACHE_ROUTE_PATTERNS.cluster), { cluster });
    return tab && tab !== CLUSTER_TABS.keys
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const elasticacheBaseCrumbs = [
  { text: "Amazon ElastiCache", href: elasticacheRoutes.clusters },
  { text: "Clusters", href: elasticacheRoutes.clusters },
];

export const clusterCrumbs = (cluster: string) => [
  ...elasticacheBaseCrumbs,
  { text: cluster, href: elasticacheRoutes.cluster(cluster) },
];
