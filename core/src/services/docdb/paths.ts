import { fillPath } from "#shared/utils/paths.ts";

export const DOCDB_SERVICE_ID = "docdb";
const DOCDB_ROOT = `/${DOCDB_SERVICE_ID}`;

export const CLUSTER_TABS = { connectivity: "connectivity", instances: "instances" } as const;

export const DOCDB_ROUTE_PATTERNS = {
  clusters: "clusters",
  createCluster: "clusters/create",
  cluster: "clusters/:cluster",
} as const;

const fullPath = (pattern: string) => `${DOCDB_ROOT}/${pattern}`;

export const docdbRoutes = {
  clusters: fullPath(DOCDB_ROUTE_PATTERNS.clusters),
  createCluster: fullPath(DOCDB_ROUTE_PATTERNS.createCluster),
  cluster: (cluster: string) => fillPath(fullPath(DOCDB_ROUTE_PATTERNS.cluster), { cluster }),
};
