import type { RDSClient } from "@aws-sdk/client-rds";
import type { ClusterRow } from "./clusters.ts";
import type { NewCluster } from "./schemas.ts";
import {
  addInstance,
  createCluster,
  deleteClusters,
  deleteInstances,
  listClusters,
  type NewInstance,
} from "./operations/clusters.ts";

// DocumentDB dùng chung API (và client) với RDS
export function createDocDbService(rds: RDSClient) {
  return {
    listClusters: () => listClusters(rds),
    createCluster: (values: NewCluster) => createCluster(rds, values),
    deleteClusters: (clusters: readonly ClusterRow[]) => deleteClusters(rds, clusters),
    addInstance: (cluster: string, instance: NewInstance) => addInstance(rds, cluster, instance),
    deleteInstances: (ids: readonly string[]) => deleteInstances(rds, ids),
  };
}

export type DocDbService = ReturnType<typeof createDocDbService>;
