import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RebootDBInstanceCommand,
  StartDBInstanceCommand,
  StopDBInstanceCommand,
  paginateDescribeDBInstances,
  type RDSClient,
} from "@aws-sdk/client-rds";
import { collectPages } from "#shared/aws/pagination.ts";
import { ALLOCATED_STORAGE_GB, DB_INSTANCE_CLASS } from "#services/rds/constants.ts";
import { isSupportedEngine } from "#services/rds/databases.ts";
import type { NewDatabase } from "#services/rds/schemas.ts";

export const DATABASE_ACTIONS = {
  stop: "stop",
  start: "start",
  reboot: "reboot",
  delete: "delete",
} as const;
export type DatabaseAction = (typeof DATABASE_ACTIONS)[keyof typeof DATABASE_ACTIONS];

export interface DatabaseActionInput {
  id: string;
  action: DatabaseAction;
}

// Instance của cluster Aurora và engine khác không thuộc phạm vi
export async function listDatabases(rds: RDSClient) {
  const databases = await collectPages(
    paginateDescribeDBInstances({ client: rds }, {}),
    (page) => page.DBInstances,
  );
  return databases.filter((database) => isSupportedEngine(database.Engine));
}

// null = không có
export async function getDatabase(rds: RDSClient, id: string) {
  const { DBInstances = [] } = await rds.send(
    new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }),
  );
  return DBInstances[0] ?? null;
}

// Floci tạo đồng bộ: trả về khi container DB đã chạy (spec 7 #1)
export const createDatabase = (rds: RDSClient, database: NewDatabase) =>
  rds.send(
    new CreateDBInstanceCommand({
      DBInstanceIdentifier: database.identifier,
      Engine: database.engine,
      DBInstanceClass: DB_INSTANCE_CLASS,
      AllocatedStorage: ALLOCATED_STORAGE_GB,
      MasterUsername: database.username,
      ...(database.credentials === "secretsManager"
        ? {
            ManageMasterUserPassword: true,
            MasterUserSecretKmsKeyId: database.secretKmsKeyId || undefined,
          }
        : { MasterUserPassword: database.password }),
      // Mặc định không mã hóa; bật thì key trống = aws/rds
      ...(database.storageEncrypted
        ? { StorageEncrypted: true, KmsKeyId: database.kmsKeyId || undefined }
        : {}),
      DBName: database.databaseName || undefined,
    }),
  );

export function runDatabaseAction(rds: RDSClient, { id, action }: DatabaseActionInput) {
  const input = { DBInstanceIdentifier: id };

  switch (action) {
    case DATABASE_ACTIONS.stop:
      return rds.send(new StopDBInstanceCommand(input));
    case DATABASE_ACTIONS.start:
      return rds.send(new StartDBInstanceCommand(input));
    case DATABASE_ACTIONS.reboot:
      return rds.send(new RebootDBInstanceCommand(input));
    case DATABASE_ACTIONS.delete:
      return rds.send(new DeleteDBInstanceCommand({ ...input, SkipFinalSnapshot: true }));
  }
}
