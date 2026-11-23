import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  RebootDBInstanceCommand,
  StartDBInstanceCommand,
  StopDBInstanceCommand,
  type DBInstance,
} from "@aws-sdk/client-rds";
import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các lệnh trang RDS dùng, qua proxy /aws của console. DB thật trong container do Floci bật

const postgresId = uniqueName("pg");
const mysqlId = uniqueName("mysql");

let rds: RDSClient;
let secrets: SecretsManagerClient;
let flociHost: string;

const describeDatabase = async (id: string): Promise<DBInstance | undefined> =>
  (await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))).DBInstances?.[0];

const waitForStatus = (id: string, status: string) =>
  waitFor(`${id} to be ${status}`, async () => {
    const database = await describeDatabase(id);
    return database?.DBInstanceStatus === status ? database : undefined;
  });

// Máy dev vào DB qua cổng compose mở (127.0.0.1:7001-7099), như ô "From your machine"
const canConnect = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: flociHost, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });

beforeAll(async () => {
  const config = await consoleConfig();
  rds = new RDSClient(viaConsole(config.region));
  secrets = new SecretsManagerClient(viaConsole(config.region));
  flociHost = new URL(config.flociPublicUrl).hostname;
});

afterAll(async () => {
  for (const id of [postgresId, mysqlId]) {
    await rds
      .send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id, SkipFinalSnapshot: true }))
      .catch(() => undefined);
  }
});

describe("databases", () => {
  it("creates a self-managed PostgreSQL database reachable from the dev machine", async () => {
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: postgresId,
        Engine: "postgres",
        DBInstanceClass: "db.t3.micro",
        AllocatedStorage: 20,
        MasterUsername: "postgres",
        MasterUserPassword: "lc-it-password",
        DBName: "appdb",
      }),
    );
    const database = await waitForStatus(postgresId, "available");

    expect(database.DBName).toBe("appdb");
    expect(database.MasterUserSecret).toBeUndefined();
    expect(database.Endpoint?.Port).toBeGreaterThan(0);
    expect(await canConnect(database.Endpoint?.Port ?? 0)).toBe(true);
  });

  it("stores the password of a managed MySQL database in a rds! secret", async () => {
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: mysqlId,
        Engine: "mysql",
        DBInstanceClass: "db.t3.micro",
        AllocatedStorage: 20,
        MasterUsername: "admin",
        ManageMasterUserPassword: true,
      }),
    );
    const database = await waitForStatus(mysqlId, "available");
    const secretArn = database.MasterUserSecret?.SecretArn ?? "";

    expect(database.EngineVersion).toBeTruthy();
    expect(secretArn).toContain(":secret:rds!db-");
    const { Name } = await secrets.send(new DescribeSecretCommand({ SecretId: secretArn }));
    expect(Name).toMatch(/^rds!db-/);
  });

  it("stops, starts and reboots, keeping the endpoint", async () => {
    const before = await describeDatabase(postgresId);

    await rds.send(new StopDBInstanceCommand({ DBInstanceIdentifier: postgresId }));
    await waitForStatus(postgresId, "stopped");
    await rds.send(new StartDBInstanceCommand({ DBInstanceIdentifier: postgresId }));
    await waitForStatus(postgresId, "available");
    await rds.send(new RebootDBInstanceCommand({ DBInstanceIdentifier: postgresId }));
    const after = await waitForStatus(postgresId, "available");

    expect(after.Endpoint?.Port).toBe(before?.Endpoint?.Port);
    expect(await canConnect(after.Endpoint?.Port ?? 0)).toBe(true);
  });

  it("deletes, and a missing database answers 404 (the detail page shows not found)", async () => {
    await rds.send(
      new DeleteDBInstanceCommand({ DBInstanceIdentifier: postgresId, SkipFinalSnapshot: true }),
    );

    const error = await waitFor("database to be gone", () =>
      describeDatabase(postgresId).then(
        () => undefined,
        (failure: { name?: string; $metadata?: { httpStatusCode?: number } }) => failure,
      ),
    );
    expect(error.name).toBe("DBInstanceNotFoundFault");
    expect(error.$metadata?.httpStatusCode).toBe(404);
  });
});
