import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateReplicationGroupCommand,
  DeleteCacheClusterCommand,
  DeleteReplicationGroupCommand,
  paginateDescribeCacheClusters,
  paginateDescribeReplicationGroups,
  type CacheCluster,
  type Endpoint,
  type ReplicationGroup,
} from "@aws-sdk/client-elasticache";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  CACHE_NODE_TYPE,
  ENGINE_LABELS,
  CLUSTER_REFRESH_INTERVAL_MS,
  CLUSTER_STATUS_AVAILABLE,
  FAILED_STATUSES,
  NODE_COUNT,
} from "../constants.ts";
import { useElastiCache } from "./useElastiCache.ts";

const clustersQueryKey = ["elasticache", "clusters"];
const MEMCACHED_ENGINE = "memcached";

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

const addressOf = (endpoint?: Endpoint): Address | undefined =>
  endpoint?.Address && endpoint.Port ? { host: endpoint.Address, port: endpoint.Port } : undefined;

export const addressText = (address: Address) => `${address.host}:${address.port}`;

export const engineLabel = (engine: string) => ENGINE_LABELS[engine] ?? engine;

export const isTransitional = (cluster: Cluster) =>
  cluster.status !== CLUSTER_STATUS_AVAILABLE && !FAILED_STATUSES.includes(cluster.status);

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

export function useClusters() {
  const client = useElastiCache();
  return useQuery({
    queryKey: clustersQueryKey,
    queryFn: async () => {
      const groups: ReplicationGroup[] = [];
      const cacheClusters: CacheCluster[] = [];
      await Promise.all([
        (async () => {
          for await (const page of paginateDescribeReplicationGroups({ client }, {})) {
            groups.push(...(page.ReplicationGroups ?? []));
          }
        })(),
        (async () => {
          const input = { ShowCacheNodeInfo: true };
          for await (const page of paginateDescribeCacheClusters({ client }, input)) {
            cacheClusters.push(...(page.CacheClusters ?? []));
          }
        })(),
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
    },
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? CLUSTER_REFRESH_INTERVAL_MS : false,
  });
}

// Local ít cluster nên lấy từ danh sách, không gọi riêng
export function useCluster(id: string) {
  const clusters = useClusters();
  return { ...clusters, data: clusters.data?.find((cluster) => cluster.id === id) };
}

export function useCreateCluster() {
  const client = useElastiCache();
  const queryClient = useQueryClient();
  return useMutation({
    // Giống AWS Console: replication group tắt cluster mode, một node, không replica
    mutationFn: ({ name, engine }: { name: string; engine: string }) =>
      client.send(
        new CreateReplicationGroupCommand({
          ReplicationGroupId: name,
          ReplicationGroupDescription: name,
          Engine: engine,
          CacheNodeType: CACHE_NODE_TYPE,
          NumCacheClusters: NODE_COUNT,
          AutomaticFailoverEnabled: false,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}

export function useDeleteClusters() {
  const client = useElastiCache();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clusters: Cluster[]) => {
      const failures: string[] = [];
      for (const cluster of clusters) {
        try {
          if (cluster.kind === "replication-group") {
            await client.send(
              new DeleteReplicationGroupCommand({ ReplicationGroupId: cluster.id }),
            );
          } else {
            await client.send(new DeleteCacheClusterCommand({ CacheClusterId: cluster.id }));
          }
        } catch (error) {
          failures.push(`${cluster.id}: ${errorMessage(error)}`);
        }
      }
      return { count: clusters.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}
