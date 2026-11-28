import { CLUSTER_STATUS_AVAILABLE, ENGINE_LABELS, FAILED_STATUSES } from "./constants.ts";

export interface Address {
  host: string;
  port: number;
}

export interface ClusterNode {
  id: string;
  role?: string;
  status?: string;
}

// Floci tách 2 loại: replication group (tạo từ console hoặc IaC) và cluster 1 node (CreateCacheCluster)
export interface Cluster {
  id: string;
  kind: "replication-group" | "cache-cluster";
  engine: string;
  engineVersion?: string;
  status: string;
  clusterMode: boolean;
  nodeType?: string;
  arn?: string;
  createdAt?: Date;
  endpoint?: Address; // Primary, hoặc Configuration endpoint khi bật cluster mode
  readerEndpoint?: Address;
  nodes: ClusterNode[];
}

export const addressText = (address: Address) => `${address.host}:${address.port}`;

export const engineLabel = (engine: string) => ENGINE_LABELS[engine] ?? engine;

export const isTransitional = (cluster: Cluster) =>
  cluster.status !== CLUSTER_STATUS_AVAILABLE && !FAILED_STATUSES.includes(cluster.status);
