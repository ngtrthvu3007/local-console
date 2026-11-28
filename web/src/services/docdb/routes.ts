import { generatePath } from "react-router";

export const DOCDB_SERVICE_ID = "docdb";
const DOCDB_ROOT = `/${DOCDB_SERVICE_ID}`;

export const CLUSTER_TABS = { connectivity: "connectivity", instances: "instances" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const DOCDB_ROUTE_PATTERNS = {
  clusters: "clusters",
  createCluster: "clusters/create",
  cluster: "clusters/:cluster",
} as const;

const fullPath = (pattern: string) => `${DOCDB_ROOT}/${pattern}`;

export const docdbRoutes = {
  clusters: fullPath(DOCDB_ROUTE_PATTERNS.clusters),
  createCluster: fullPath(DOCDB_ROUTE_PATTERNS.createCluster),
  cluster: (cluster: string) => generatePath(fullPath(DOCDB_ROUTE_PATTERNS.cluster), { cluster }),
};

export const docdbBaseCrumbs = [
  { text: "Amazon DocumentDB", href: docdbRoutes.clusters },
  { text: "Clusters", href: docdbRoutes.clusters },
];

export const clusterCrumbs = (cluster: string) => [
  ...docdbBaseCrumbs,
  { text: cluster, href: docdbRoutes.cluster(cluster) },
];
