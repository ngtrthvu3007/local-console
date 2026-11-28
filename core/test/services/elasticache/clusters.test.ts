import { describe, expect, it, vi } from "vitest";
import {
  DescribeCacheClustersCommand,
  DescribeReplicationGroupsCommand,
  ElastiCacheClient,
} from "@aws-sdk/client-elasticache";
import { listClusters } from "#services/elasticache/operations/clusters.ts";

const GROUP = {
  ReplicationGroupId: "orders",
  Engine: "valkey",
  Status: "available",
  NodeGroups: [
    {
      PrimaryEndpoint: { Address: "localhost", Port: 6379 },
      NodeGroupMembers: [{ CacheClusterId: "orders-001", CurrentRole: "primary" }],
    },
  ],
};
const MEMBER = {
  CacheClusterId: "orders-001",
  ReplicationGroupId: "orders",
  CacheClusterStatus: "available",
};
const STANDALONE = {
  CacheClusterId: "sessions",
  Engine: "redis",
  CacheClusterStatus: "creating",
  CacheNodes: [{ CacheNodeId: "0001", Endpoint: { Address: "localhost", Port: 6380 } }],
};
const MEMCACHED = { CacheClusterId: "legacy", Engine: "memcached" };

function fakeClient() {
  const client = new ElastiCacheClient({});
  vi.spyOn(client, "send").mockImplementation(async (command: unknown) =>
    command instanceof DescribeReplicationGroupsCommand
      ? { ReplicationGroups: [GROUP] }
      : command instanceof DescribeCacheClustersCommand
        ? { CacheClusters: [MEMBER, STANDALONE, MEMCACHED] }
        : {},
  );
  return client;
}

describe("listClusters", () => {
  it("lists replication groups and standalone clusters, without their members or Memcached", async () => {
    const clusters = await listClusters(fakeClient());

    expect(clusters.map((cluster) => [cluster.id, cluster.kind])).toEqual([
      ["orders", "replication-group"],
      ["sessions", "cache-cluster"],
    ]);
    expect(clusters[0].endpoint).toEqual({ host: "localhost", port: 6379 });
    expect(clusters[0].nodes).toEqual([{ id: "orders-001", role: "primary", status: "available" }]);
    expect(clusters[1].endpoint).toEqual({ host: "localhost", port: 6380 });
    expect(clusters[1].nodes).toEqual([{ id: "sessions-0001", status: undefined }]);
  });
});
