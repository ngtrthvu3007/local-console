import { describe, expect, it } from "vitest";
import { CreateDBInstanceCommand, type RDSClient } from "@aws-sdk/client-rds";
import {
  appConnectionString,
  groupClusters,
  localConnectionString,
  socatCommand,
} from "#services/docdb/clusters.ts";
import { addInstanceSchema, createClusterSchema } from "#services/docdb/schemas.ts";
import { docdbRoutes } from "#services/docdb/paths.ts";
import { createCluster } from "#services/docdb/operations/clusters.ts";

const cluster = (id: string) => ({ DBClusterIdentifier: id, Endpoint: "172.28.0.6", Port: 27017 });
const instance = (id: string, clusterId?: string) => ({
  DBInstanceIdentifier: id,
  DBClusterIdentifier: clusterId,
});

describe("groupClusters", () => {
  // Floci trả DBClusterMembers rỗng (spec 7 #2): gom bằng DBClusterIdentifier của instance
  it("groups instances by cluster even though DBClusterMembers is empty", () => {
    const rows = groupClusters(
      [cluster("a"), cluster("b")],
      [instance("a-1", "a"), instance("a-2", "a"), instance("x-1", "x"), instance("lone")],
    );
    expect(rows.map((row) => [row.id, row.instances.map((i) => i.DBInstanceIdentifier)])).toEqual([
      ["a", ["a-1", "a-2"]],
      ["b", []],
    ]);
  });
});

describe("connection", () => {
  // Khóa nguyên lệnh: sai một ký tự ở đoạn docker inspect là dev không forward được (spec 3.3)
  it("builds the exact socat command: 127.0.0.1, --rm, network and target from the cluster container", () => {
    expect(socatCommand("orders-db")).toBe(
      [
        "docker run --rm -d --name docdb-forward-orders-db \\",
        `  --network "$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' floci-aws-docdb-orders-db)" \\`,
        "  -p 127.0.0.1:27017:27017 alpine/socat:1.8.0.3 \\",
        "  tcp-listen:27017,fork,reuseaddr tcp-connect:floci-aws-docdb-orders-db:27017",
      ].join("\n"),
    );
  });

  it("builds connection strings for apps in compose and for Compass", () => {
    expect(appConnectionString({ endpoint: "172.28.0.6", port: 27017 }, "admin1")).toBe(
      "mongodb://admin1:<password>@172.28.0.6:27017/?directConnection=true&retryWrites=false",
    );
    expect(localConnectionString("admin1")).toBe(
      "mongodb://admin1:<password>@localhost:27017/?directConnection=true",
    );
  });
});

describe("createClusterSchema", () => {
  const valid = {
    identifier: "orders-db",
    username: "admin1",
    password: "it's a pass",
    confirmPassword: "it's a pass",
    instanceClass: "db.t3.medium",
    instanceCount: "1",
  };

  it("checks AWS naming and password rules Floci doesn't", () => {
    expect(createClusterSchema.safeParse(valid).success).toBe(true);
    for (const identifier of ["Orders", "1db", "a--b", "db-", "a".repeat(64)]) {
      expect(createClusterSchema.safeParse({ ...valid, identifier }).success).toBe(false);
    }
    for (const password of ["short", "has@at!!", "has/slash", 'has"quote', "x".repeat(101)]) {
      expect(
        createClusterSchema.safeParse({ ...valid, password, confirmPassword: password }).success,
      ).toBe(false);
    }
    expect(createClusterSchema.safeParse({ ...valid, confirmPassword: "other pass" }).success).toBe(
      false,
    );
    expect(createClusterSchema.safeParse({ ...valid, instanceCount: "17" }).success).toBe(false);
    expect(createClusterSchema.safeParse({ ...valid, username: "1admin" }).success).toBe(false);
  });
});

describe("docdbRoutes", () => {
  it("builds the cluster path", () => {
    expect(docdbRoutes.cluster("orders-db")).toBe("/docdb/clusters/orders-db");
  });
});

describe("identifier length", () => {
  const base = {
    username: "admin1",
    password: "secret999",
    confirmPassword: "secret999",
    instanceClass: "db.t3.medium",
    instanceCount: "16",
  };
  it("keeps cluster names short enough for their instance ids", () => {
    expect(createClusterSchema.safeParse({ ...base, identifier: "a".repeat(60) }).success).toBe(
      true,
    );
    expect(createClusterSchema.safeParse({ ...base, identifier: "a".repeat(61) }).success).toBe(
      false,
    );
    expect(
      addInstanceSchema.safeParse({
        identifier: `${"a".repeat(60)}-16`,
        instanceClass: "db.t3.medium",
      }).success,
    ).toBe(true);
  });
});

describe("createCluster", () => {
  // Cluster đã tạo mà một instance lỗi: vẫn trả id để mở trang chi tiết, kèm instance lỗi
  it("returns the cluster and the instances that failed instead of throwing", async () => {
    const sent: string[] = [];
    const client = {
      send: async (command: { input: { DBInstanceIdentifier?: string } }) => {
        if (command instanceof CreateDBInstanceCommand) {
          sent.push(command.input.DBInstanceIdentifier ?? "");
          if (command.input.DBInstanceIdentifier === "orders-db-2") throw new Error("boom");
        }
      },
    } as unknown as RDSClient;
    const result = await createCluster(client, {
      identifier: "orders-db",
      username: "admin1",
      password: "secret999",
      confirmPassword: "secret999",
      instanceClass: "db.t3.medium",
      instanceCount: 3,
    });
    expect(sent).toEqual(["orders-db-1", "orders-db-2", "orders-db-3"]);
    expect(result).toEqual({ id: "orders-db", count: 2, failures: ["orders-db-2: boom"] });
  });
});
