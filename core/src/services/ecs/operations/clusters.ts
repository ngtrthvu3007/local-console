import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DescribeClustersCommand,
  paginateListClusters,
  type Cluster,
  type ECSClient,
} from "@aws-sdk/client-ecs";
import { chunks, collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { DESCRIBE_BATCH, STATUS } from "#services/ecs/constants.ts";

export interface ClusterRow {
  name: string;
  arn: string;
  activeServices: number;
  runningTasks: number;
  pendingTasks: number;
}

async function describeClusters(ecs: ECSClient, clusters: readonly string[]) {
  const batches = await Promise.all(
    chunks(clusters, DESCRIBE_BATCH.clusters).map(
      async (batch) => (await ecs.send(new DescribeClustersCommand({ clusters: batch }))).clusters,
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
export async function listClusters(ecs: ECSClient) {
  const arns = await collectPages(
    paginateListClusters({ client: ecs }, {}),
    (page) => page.clusterArns,
  );
  return (await describeClusters(ecs, arns)).map(toClusterRow);
}

// null = cluster không có (DescribeClusters trả failures) hoặc đã xóa (INACTIVE).
// Hỏi cái này trước ListTasks / ListServices: cluster lạ thì hai lệnh đó trả 400,
// và với tên "default" thì Floci tự tạo cluster (spec 7 #13)
export async function getCluster(ecs: ECSClient, name: string) {
  const [cluster] = await describeClusters(ecs, [name]);
  return cluster && cluster.status !== STATUS.inactive ? cluster : null;
}

export async function createCluster(ecs: ECSClient, name: string) {
  await ecs.send(new CreateClusterCommand({ clusterName: name }));
  return name;
}

// Còn service / task thì Floci từ chối như AWS; lỗi gốc hiện theo từng cluster
export const deleteClusters = (ecs: ECSClient, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => ecs.send(new DeleteClusterCommand({ cluster: name })),
  );
