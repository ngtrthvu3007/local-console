import {
  CreateDBClusterCommand,
  CreateDBInstanceCommand,
  DeleteDBClusterCommand,
  DeleteDBInstanceCommand,
  paginateDescribeDBClusters,
  paginateDescribeDBInstances,
  type RDSClient,
} from "@aws-sdk/client-rds";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { groupClusters, instanceId, type ClusterRow } from "#services/docdb/clusters.ts";
import { DOCDB_ENGINE, ENGINE_FILTER } from "#services/docdb/constants.ts";
import type { NewCluster } from "#services/docdb/schemas.ts";

export interface NewInstance {
  identifier: string;
  instanceClass: string;
}

// Cluster kèm instance của chúng
export async function listClusters(rds: RDSClient) {
  const [clusters, instances] = await Promise.all([
    collectPages(
      paginateDescribeDBClusters({ client: rds }, { Filters: ENGINE_FILTER }),
      (page) => page.DBClusters,
    ),
    collectPages(
      paginateDescribeDBInstances({ client: rds }, { Filters: ENGINE_FILTER }),
      (page) => page.DBInstances,
    ),
  ]);
  return groupClusters(clusters, instances);
}

// Instance của DocumentDB trên Floci chỉ là bản ghi, không bật thêm container (spec 7 #3)
export const addInstance = (rds: RDSClient, cluster: string, instance: NewInstance) =>
  rds.send(
    new CreateDBInstanceCommand({
      DBInstanceIdentifier: instance.identifier,
      DBClusterIdentifier: cluster,
      Engine: DOCDB_ENGINE,
      DBInstanceClass: instance.instanceClass,
    }),
  );

// Cluster lỗi thì ném; instance lỗi thì gom lại để trang vẫn mở cluster đã tạo
export async function createCluster(rds: RDSClient, values: NewCluster) {
  await rds.send(
    new CreateDBClusterCommand({
      DBClusterIdentifier: values.identifier,
      Engine: DOCDB_ENGINE,
      MasterUsername: values.username,
      MasterUserPassword: values.password,
    }),
  );
  const ids = Array.from({ length: values.instanceCount }, (_, index) =>
    instanceId(values.identifier, index),
  );
  const result = await runEach(
    ids,
    (id) => id,
    (id) =>
      addInstance(rds, values.identifier, { identifier: id, instanceClass: values.instanceClass }),
  );
  return { id: values.identifier, ...result };
}

const deleteInstance = (rds: RDSClient, id?: string) =>
  rds.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id }));

// AWS bắt xóa instance trước cluster: console làm hộ trong một lần xác nhận (spec 3.1)
export const deleteClusters = (rds: RDSClient, clusters: readonly ClusterRow[]) =>
  runEach(
    clusters,
    (cluster) => cluster.id,
    async (cluster) => {
      for (const instance of cluster.instances)
        await deleteInstance(rds, instance.DBInstanceIdentifier);
      await rds.send(
        new DeleteDBClusterCommand({ DBClusterIdentifier: cluster.id, SkipFinalSnapshot: true }),
      );
    },
  );

export const deleteInstances = (rds: RDSClient, ids: readonly string[]) =>
  runEach(
    ids,
    (id) => id,
    (id) => deleteInstance(rds, id),
  );
