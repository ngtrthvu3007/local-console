import { describe, expect, it } from "vitest";
import { connectionUrl, databaseSample } from "../../../src/services/rds/codeSamples.ts";
import {
  engineText,
  isTransitional,
  machineAddress,
  statusLabel,
} from "../../../src/services/rds/databases.ts";
import { rdsRoutes } from "../../../src/services/rds/routes.ts";
import {
  createDatabaseSchema,
  type CreateDatabaseForm,
} from "../../../src/services/rds/schemas.ts";

const VALID: CreateDatabaseForm = {
  engine: "postgres",
  identifier: "app-db",
  username: "postgres",
  credentials: "selfManaged",
  password: "secret123",
  confirmPassword: "secret123",
  databaseName: "",
};

const messages = (form: Partial<CreateDatabaseForm>) =>
  createDatabaseSchema
    .safeParse({ ...VALID, ...form })
    .error?.issues.map((issue) => issue.message) ?? [];

describe("createDatabaseSchema", () => {
  it("accepts a valid form", () => {
    expect(messages({})).toEqual([]);
    expect(messages({ databaseName: "app_db1" })).toEqual([]);
  });

  it("applies the RDS identifier rules", () => {
    expect(messages({ identifier: "App-db" })).toHaveLength(1);
    expect(messages({ identifier: "1db" })).toHaveLength(1);
    expect(messages({ identifier: "app--db" })).toEqual(["Can't contain two hyphens in a row."]);
    expect(messages({ identifier: "app-" })).toEqual(["Can't end with a hyphen."]);
    expect(messages({ identifier: "a".repeat(64) })).toHaveLength(1);
  });

  it("checks the password only when self managed", () => {
    expect(messages({ password: "short", confirmPassword: "short" })).toEqual([
      "Must be 8–128 characters.",
    ]);
    expect(messages({ confirmPassword: "other123" })).toEqual(["Passwords don't match."]);
    expect(messages({ credentials: "secretsManager", password: "", confirmPassword: "" })).toEqual(
      [],
    );
  });

  // Floci nhận các password này và đăng nhập được, AWS thì từ chối
  it("applies the AWS password rules Floci skips", () => {
    const withPassword = (password: string, engine: CreateDatabaseForm["engine"] = "postgres") =>
      messages({ engine, password, confirmPassword: password });

    for (const password of ["pass/word1", "pass'word1", 'pass"word1', "pass@word1", "pass word1"]) {
      expect(withPassword(password), password).toEqual([
        "Use printable ASCII characters except / ' \" @ and spaces.",
      ]);
    }

    expect(withPassword("p!#$%&()*+,-.:;<=>?[]^_`{|}~9")).toEqual([]);
    expect(withPassword("a".repeat(42), "mysql")).toEqual(["Must be 8–41 characters."]);
    expect(withPassword("a".repeat(42))).toEqual([]);
  });

  it("rejects a username or database name that doesn't start with a letter", () => {
    expect(messages({ username: "1admin" })).toHaveLength(1);
    expect(messages({ username: "a".repeat(17) })).toHaveLength(1);
    expect(messages({ databaseName: "1db" })).toHaveLength(1);
  });
});

describe("databases", () => {
  it("shows the engine version only when Floci returns one", () => {
    expect(engineText({ Engine: "postgres", EngineVersion: "16.4" })).toBe("PostgreSQL 16.4");
    expect(engineText({ Engine: "mysql" })).toBe("MySQL");
  });

  it("polls only while the status is changing", () => {
    expect(isTransitional({ DBInstanceStatus: "available" })).toBe(false);
    expect(isTransitional({ DBInstanceStatus: "stopped" })).toBe(false);
    expect(isTransitional({ DBInstanceStatus: "failed" })).toBe(false);
    expect(isTransitional({ DBInstanceStatus: "stopping" })).toBe(true);
  });

  it("labels statuses like AWS", () => {
    expect(statusLabel("storage-full")).toBe("Storage full");
  });

  it("builds the address for the dev machine from Floci's public URL", () => {
    expect(machineAddress("http://localhost:4566", 7001)).toEqual({
      host: "localhost",
      port: 7001,
    });
    expect(machineAddress("http://localhost:4566")).toBeUndefined();
  });

  it("keeps the default tab out of the URL", () => {
    expect(rdsRoutes.database("app-db")).toBe("/rds/databases/app-db");
    expect(rdsRoutes.database("app-db", "logs")).toBe("/rds/databases/app-db?tab=logs");
  });
});

describe("connect", () => {
  const machine = { host: "localhost", port: 7001 };
  const endpoint = { host: "172.28.0.2", port: 7001 };

  it("builds a URL without the password, with the database only when there is one", () => {
    expect(
      connectionUrl("postgres", { MasterUsername: "postgres", DBName: "appdb" }, machine),
    ).toBe("postgresql://postgres@localhost:7001/appdb");
    expect(connectionUrl("mysql", { MasterUsername: "admin" }, endpoint)).toBe(
      "mysql://admin@172.28.0.2:7001",
    );
  });

  it("reads the password from the environment and names the compose / Lambda endpoint", () => {
    const sample = databaseSample("mysql", { MasterUsername: "admin" }, machine, endpoint);

    expect(sample.node).toContain("password: process.env.DB_PASSWORD,");
    expect(sample.node).toContain("DB_HOST=172.28.0.2 DB_PORT=7001");
    expect(sample.node).not.toContain("database:");
    expect(sample.python).toContain('password=os.environ["DB_PASSWORD"],');
  });

  it("uses the postgres database when none was set, with each driver's keyword", () => {
    const sample = databaseSample("postgres", { MasterUsername: "postgres" }, machine, endpoint);

    expect(sample.node).toContain('database: "postgres",');
    expect(sample.python).toContain('dbname="postgres",');
  });
});
