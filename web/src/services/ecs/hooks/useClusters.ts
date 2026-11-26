import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DescribeClustersCommand,
  paginateListClusters,
  type Cluster,
  type ECSClient,
} from "@aws-sdk/client-ecs";
import { chunks } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { DESCRIBE_BATCH, STATUS } from "../constants.ts";
import { ECS_QUERY_ROOT, clusterKey, useEcs } from "./useEcs.ts";

const clustersQueryKey = [ECS_QUERY_ROOT, "clusters"];

export interface ClusterRow {
  name: string;
  arn: string;
  activeServices: number;
  runningTasks: number;
  pendingTasks: number;
}

async function describeClusters(client: ECSClient, clusters: readonly string[]) {
  const batches = await Promise.all(
    chunks(clusters, DESCRIBE_BATCH.clusters).map(
      async (batch) =>
        (await client.send(new DescribeClustersCommand({ clusters: batch }))).clusters,
    ),
  );
  return batches.flatMap((batch) => batch ?? []);
}

const toClusterRow = (cluster: Cluster): ClusterRow => ({
  name: cluster.clusterName ?? "",
  arn: cluster.clusterArn ?? "",
  activeServices: cluster.activeServicesCount ?? 0,
  runningTasks: cluster.runningTasksCount ?? 0,
  pendingTasks: cluster.pendingTasksCount ?? 0,
});

// ListClusters chỉ có ARN: hỏi DescribeClusters theo lô để có số service / task
async function listClusterRows(client: ECSClient) {
  const arns: string[] = [];

  for await (const page of paginateListClusters({ client }, {})) {
    arns.push(...(page.clusterArns ?? []));
  }

  return (await describeClusters(client, arns)).map(toClusterRow);
}

export function useClusters() {
  const client = useEcs();
  return useQuery({ queryKey: clustersQueryKey, queryFn: () => listClusterRows(client) });
}

// null = cluster không có (DescribeClusters trả failures) hoặc đã xóa (INACTIVE).
// Trang chi tiết hỏi cái này trước ListTasks / ListServices: cluster lạ thì hai lệnh đó trả 400,
// và với tên "default" thì Floci tự tạo cluster (spec 7 #13)
export function useCluster(name: string) {
  const client = useEcs();

  return useQuery({
    queryKey: clusterKey(name),
    queryFn: async () => {
      const [cluster] = await describeClusters(client, [name]);
      return cluster && cluster.status !== STATUS.inactive ? cluster : null;
    },
  });
}

export function useCreateCluster() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await client.send(new CreateClusterCommand({ clusterName: name }));
      return name;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ECS_QUERY_ROOT] }),
  });
}

export function useDeleteClusters() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    // Còn service / task thì Floci từ chối như AWS; lỗi gốc hiện theo từng cluster
    mutationFn: (names: readonly string[]) =>
      runEach(
        names,
        (name) => name,
        (name) => client.send(new DeleteClusterCommand({ cluster: name })),
      ),
    // Không tải lại query chi tiết: xóa từ trang chi tiết thì trang sẽ thành "not found" trước khi về danh sách
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}
