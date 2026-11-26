import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateDBClusterCommand,
  CreateDBInstanceCommand,
  DeleteDBClusterCommand,
  DeleteDBInstanceCommand,
  DescribeDBClustersCommand,
  DescribeDBInstancesCommand,
  RDSClient,
} from "@aws-sdk/client-rds";
import { consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

// Hành vi DocumentDB của Floci mà trang DocumentDB dựa vào, qua proxy /aws của console
// (spec DocumentDB mục 7). DocumentDB dùng chung API với RDS

const ENGINE_FILTER = [{ Name: "engine", Values: ["docdb"] }];
const INSTANCE_CLASS = "db.t3.medium";
const HTTP_NOT_FOUND = 404;

let rds: RDSClient;
const cluster = uniqueName("docdb");
const instances = [`${cluster}-1`, `${cluster}-2`];

const listClusters = async () =>
  (await rds.send(new DescribeDBClustersCommand({ Filters: ENGINE_FILTER }))).DBClusters ?? [];
const listInstances = async () =>
  (await rds.send(new DescribeDBInstancesCommand({ Filters: ENGINE_FILTER }))).DBInstances ?? [];
const instancesOf = async (id: string) =>
  (await listInstances()).filter((instance) => instance.DBClusterIdentifier === id);

const deleteCluster = async (id: string) => {
  for (const instance of await instancesOf(id)) {
    await rds
      .send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: instance.DBInstanceIdentifier }))
      .catch(() => undefined);
  }
  await rds
    .send(new DeleteDBClusterCommand({ DBClusterIdentifier: id, SkipFinalSnapshot: true }))
    .catch(() => undefined);
};

beforeAll(async () => {
  rds = new RDSClient(viaConsole((await consoleConfig()).region));
  await rds.send(
    new CreateDBClusterCommand({
      DBClusterIdentifier: cluster,
      Engine: "docdb",
      MasterUsername: "admin1",
      MasterUserPassword: "secret999",
    }),
  );
  for (const id of instances) {
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: id,
        DBClusterIdentifier: cluster,
        Engine: "docdb",
        DBInstanceClass: INSTANCE_CLASS,
      }),
    );
  }
}, 120_000);

afterAll(async () => {
  await deleteCluster(cluster);
});

describe("clusters", () => {
  it("lists the cluster with its endpoint", async () => {
    const found = (await listClusters()).find((item) => item.DBClusterIdentifier === cluster);
    expect(found?.Status).toBe("available");
    expect(found?.Endpoint).toBeTruthy();
    expect(found?.Port).toBe(27017);
  });

  // Floci trả DBClusterMembers rỗng: trang gom instance bằng DescribeDBInstances (spec 7 #2)
  it("lists instances by their cluster, not through DBClusterMembers", async () => {
    const found = (await listClusters()).find((item) => item.DBClusterIdentifier === cluster);
    expect(found?.DBClusterMembers ?? []).toEqual([]);
    expect((await instancesOf(cluster)).map((item) => item.DBInstanceIdentifier).sort()).toEqual(
      instances,
    );
  });

  // Vì vậy trang chi tiết dò trong danh sách thay vì gọi theo identifier (spec 7 #5)
  it("answers 404 for a missing cluster", async () => {
    await expect(
      rds.send(new DescribeDBClustersCommand({ DBClusterIdentifier: uniqueName("docdb-missing") })),
    ).rejects.toMatchObject({
      name: "DBClusterNotFoundFault",
      $metadata: { httpStatusCode: HTTP_NOT_FOUND },
    });
  });

  // Xóa cluster trên console: xóa instance trước rồi mới tới cluster (spec 3.1)
  it("refuses to delete a cluster that still has instances, then deletes it after them", async () => {
    const extra = uniqueName("docdb-del");
    await rds.send(
      new CreateDBClusterCommand({
        DBClusterIdentifier: extra,
        Engine: "docdb",
        MasterUsername: "admin1",
        MasterUserPassword: "secret999",
      }),
    );
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: `${extra}-1`,
        DBClusterIdentifier: extra,
        Engine: "docdb",
        DBInstanceClass: INSTANCE_CLASS,
      }),
    );
    await expect(
      rds.send(new DeleteDBClusterCommand({ DBClusterIdentifier: extra, SkipFinalSnapshot: true })),
    ).rejects.toMatchObject({ name: "InvalidDBClusterStateFault" });

    await deleteCluster(extra);
    expect((await listClusters()).some((item) => item.DBClusterIdentifier === extra)).toBe(false);
    expect(await instancesOf(extra)).toEqual([]);
  });
});

describe("instances", () => {
  it("adds an instance to a cluster and deletes it", async () => {
    const extra = `${cluster}-extra`;
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: extra,
        DBClusterIdentifier: cluster,
        Engine: "docdb",
        DBInstanceClass: INSTANCE_CLASS,
      }),
    );
    expect((await instancesOf(cluster)).map((item) => item.DBInstanceIdentifier)).toContain(extra);

    await rds.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: extra }));
    expect((await instancesOf(cluster)).map((item) => item.DBInstanceIdentifier)).not.toContain(
      extra,
    );
  });
});
