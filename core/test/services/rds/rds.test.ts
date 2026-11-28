import { describe, expect, it } from "vitest";
import {
  engineText,
  isTransitional,
  machineAddress,
  statusLabel,
} from "#services/rds/databases.ts";
import { createDatabaseSchema, type CreateDatabaseForm } from "#services/rds/schemas.ts";
import { rdsRoutes } from "#services/rds/paths.ts";

const VALID: CreateDatabaseForm = {
  engine: "postgres",
  identifier: "app-db",
  username: "postgres",
  credentials: "selfManaged",
  password: "secret123",
  confirmPassword: "secret123",
  databaseName: "",
  storageEncrypted: false,
  kmsKeyId: "",
  secretKmsKeyId: "",
};

const messages = (form: Partial<CreateDatabaseForm>) =>
  createDatabaseSchema
    .safeParse({ ...VALID, ...form })
    .error?.issues.map((issue) => issue.message) ?? [];

describe("createDatabaseSchema", () => {
  it("leaves storage unencrypted by default and takes KMS key ARNs", () => {
    const arn = "arn:aws:kms:ap-southeast-1:000000000000:key/k1";
    expect(createDatabaseSchema.parse(VALID).storageEncrypted).toBe(false);
    expect(messages({ storageEncrypted: true, kmsKeyId: arn, secretKmsKeyId: arn })).toEqual([]);
    expect(messages({ kmsKeyId: "k1" })).not.toEqual([]);
  });

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
