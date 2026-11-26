import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateDBClusterCommand,
  CreateDBInstanceCommand,
  DeleteDBClusterCommand,
  DeleteDBInstanceCommand,
  paginateDescribeDBClusters,
  paginateDescribeDBInstances,
  type DBCluster,
  type DBInstance,
  type RDSClient,
} from "@aws-sdk/client-rds";
import { runEach } from "@shared/hooks/useNotify.ts";
import { useRDS } from "../../rds/hooks/useRDS.ts";
import { groupClusters, type ClusterRow } from "../clusters.ts";
import { DOCDB_ENGINE, ENGINE_FILTER } from "../constants.ts";
import type { NewCluster } from "../schemas.ts";

// Query duy nhất của DocumentDB: cluster kèm instance của chúng
export const clustersKey = ["docdb", "clusters"];

async function listClusterRows(client: RDSClient) {
  const clusters: DBCluster[] = [];
  const instances: DBInstance[] = [];
  for await (const page of paginateDescribeDBClusters({ client }, { Filters: ENGINE_FILTER })) {
    clusters.push(...(page.DBClusters ?? []));
  }
  for await (const page of paginateDescribeDBInstances({ client }, { Filters: ENGINE_FILTER })) {
    instances.push(...(page.DBInstances ?? []));
  }
  return groupClusters(clusters, instances);
}

export function useClusters() {
  const client = useRDS();
  return useQuery({ queryKey: clustersKey, queryFn: () => listClusterRows(client) });
}

// null = không có. Dò trong danh sách: DescribeDBClusters theo identifier trả 404 → console.error
export function useCluster(id: string) {
  const clusters = useClusters();
  const data = clusters.data && (clusters.data.find((cluster) => cluster.id === id) ?? null);
  return { ...clusters, data };
}

export const instanceId = (cluster: string, index: number) => `${cluster}-${index + 1}`;

// Cluster lỗi thì ném; instance lỗi thì gom lại để trang vẫn mở cluster đã tạo
export async function createCluster(client: RDSClient, values: NewCluster) {
  await client.send(
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
      client.send(
        new CreateDBInstanceCommand({
          DBInstanceIdentifier: id,
          DBClusterIdentifier: values.identifier,
          Engine: DOCDB_ENGINE,
          DBInstanceClass: values.instanceClass,
        }),
      ),
  );
  return { id: values.identifier, ...result };
}

export function useCreateCluster() {
  const client = useRDS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: NewCluster) => createCluster(client, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}

// AWS bắt xóa instance trước cluster: console làm hộ trong một lần xác nhận (spec 3.1)
export function useDeleteClusters() {
  const client = useRDS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clusters: readonly ClusterRow[]) =>
      runEach(
        clusters,
        (cluster) => cluster.id,
        async (cluster) => {
          for (const instance of cluster.instances) {
            await client.send(
              new DeleteDBInstanceCommand({ DBInstanceIdentifier: instance.DBInstanceIdentifier }),
            );
          }
          await client.send(
            new DeleteDBClusterCommand({
              DBClusterIdentifier: cluster.id,
              SkipFinalSnapshot: true,
            }),
          );
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}
