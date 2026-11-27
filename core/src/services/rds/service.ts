import type { RDSClient } from "@aws-sdk/client-rds";
import type { NewDatabase } from "./schemas.ts";
import {
  createDatabase,
  getDatabase,
  listDatabases,
  runDatabaseAction,
  type DatabaseActionInput,
} from "./operations/databases.ts";

export function createRdsService(rds: RDSClient) {
  return {
    listDatabases: () => listDatabases(rds),
    getDatabase: (id: string) => getDatabase(rds, id),
    createDatabase: (database: NewDatabase) => createDatabase(rds, database),
    runDatabaseAction: (input: DatabaseActionInput) => runDatabaseAction(rds, input),
  };
}

export type RdsService = ReturnType<typeof createRdsService>;
