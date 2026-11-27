import {
  CreateReplicationGroupCommand,
  DeleteCacheClusterCommand,
  DeleteReplicationGroupCommand,
  paginateDescribeCacheClusters,
  paginateDescribeReplicationGroups,
  type CacheCluster,
  type ElastiCacheClient,
  type Endpoint,
  type ReplicationGroup,
} from "@aws-sdk/client-elasticache";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import type { Address, Cluster } from "#services/elasticache/clusters.ts";
import { CACHE_NODE_TYPE, MEMCACHED_ENGINE, NODE_COUNT } from "#services/elasticache/constants.ts";

export interface CreateClusterInput {
  name: string;
  engine: string;
}

const addressOf = (endpoint?: Endpoint): Address | undefined =>
  endpoint?.Address && endpoint.Port ? { host: endpoint.Address, port: endpoint.Port } : undefined;

function fromReplicationGroup(group: ReplicationGroup, members: CacheCluster[]): Cluster {
  const nodeGroup = group.NodeGroups?.[0];
  const firstMember = members[0];
  return {
    id: group.ReplicationGroupId!,
    kind: "replication-group",
    engine: group.Engine ?? firstMember?.Engine ?? "",
    engineVersion: firstMember?.EngineVersion,
    status: group.Status ?? "",
    clusterMode: Boolean(group.ClusterEnabled),
    nodeType: group.CacheNodeType,
    arn: group.ARN,
    createdAt: group.ReplicationGroupCreateTime ?? firstMember?.CacheClusterCreateTime,
    endpoint: addressOf(
      group.ClusterEnabled ? group.ConfigurationEndpoint : nodeGroup?.PrimaryEndpoint,
    ),
    readerEndpoint: addressOf(nodeGroup?.ReaderEndpoint),
    nodes: (group.NodeGroups ?? []).flatMap((nodes) =>
      (nodes.NodeGroupMembers ?? []).map((member) => ({
        id: member.CacheClusterId!,
        role: member.CurrentRole,
        status: members.find((cluster) => cluster.CacheClusterId === member.CacheClusterId)
          ?.CacheClusterStatus,
      })),
    ),
  };
}

function fromCacheCluster(cluster: CacheCluster): Cluster {
  return {
    id: cluster.CacheClusterId!,
    kind: "cache-cluster",
    engine: cluster.Engine ?? "",
    engineVersion: cluster.EngineVersion,
    status: cluster.CacheClusterStatus ?? "",
    clusterMode: false,
    nodeType: cluster.CacheNodeType,
    arn: cluster.ARN,
    createdAt: cluster.CacheClusterCreateTime,
    endpoint: addressOf(cluster.CacheNodes?.[0]?.Endpoint),
    nodes: (cluster.CacheNodes ?? []).map((node) => ({
      id: `${cluster.CacheClusterId}-${node.CacheNodeId}`,
      status: node.CacheNodeStatus,
    })),
  };
}

export async function listClusters(elasticache: ElastiCacheClient): Promise<Cluster[]> {
  const [groups, cacheClusters] = await Promise.all([
    collectPages(
      paginateDescribeReplicationGroups({ client: elasticache }, {}),
      (page) => page.ReplicationGroups,
    ),
    collectPages(
      paginateDescribeCacheClusters({ client: elasticache }, { ShowCacheNodeInfo: true }),
      (page) => page.CacheClusters,
    ),
  ]);
  const membersOf = (group: ReplicationGroup) =>
    cacheClusters.filter((cluster) => cluster.ReplicationGroupId === group.ReplicationGroupId);
  // Node thuộc replication group đã nằm trong group; Memcached không thuộc phạm vi
  const standalone = cacheClusters.filter(
    (cluster) => !cluster.ReplicationGroupId && cluster.Engine !== MEMCACHED_ENGINE,
  );

  return [
    ...groups.map((group) => fromReplicationGroup(group, membersOf(group))),
    ...standalone.map(fromCacheCluster),
  ];
}

// Giống AWS Console: replication group tắt cluster mode, một node, không replica
export const createCluster = (
  elasticache: ElastiCacheClient,
  { name, engine }: CreateClusterInput,
) =>
  elasticache.send(
    new CreateReplicationGroupCommand({
      ReplicationGroupId: name,
      ReplicationGroupDescription: name,
      Engine: engine,
      CacheNodeType: CACHE_NODE_TYPE,
      NumCacheClusters: NODE_COUNT,
      AutomaticFailoverEnabled: false,
    }),
  );

export const deleteClusters = (elasticache: ElastiCacheClient, clusters: readonly Cluster[]) =>
  runEach(
    clusters,
    (cluster) => cluster.id,
    (cluster) =>
      cluster.kind === "replication-group"
        ? elasticache.send(new DeleteReplicationGroupCommand({ ReplicationGroupId: cluster.id }))
        : elasticache.send(new DeleteCacheClusterCommand({ CacheClusterId: cluster.id })),
  );
