import type { ElastiCacheClient } from "@aws-sdk/client-elasticache";
import type { Cluster } from "./clusters.ts";
import {
  createCluster,
  deleteClusters,
  listClusters,
  type CreateClusterInput,
} from "./operations/clusters.ts";

// Chỉ phần AWS (cluster). Key Redis đi qua API của console server (server/src/routes/redis)
export function createElastiCacheService(elasticache: ElastiCacheClient) {
  return {
    listClusters: () => listClusters(elasticache),
    createCluster: (input: CreateClusterInput) => createCluster(elasticache, input),
    deleteClusters: (clusters: readonly Cluster[]) => deleteClusters(elasticache, clusters),
  };
}
