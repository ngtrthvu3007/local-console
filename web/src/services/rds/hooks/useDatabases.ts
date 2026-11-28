import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RebootDBInstanceCommand,
  StartDBInstanceCommand,
  StopDBInstanceCommand,
  paginateDescribeDBInstances,
  type DBInstance,
} from "@aws-sdk/client-rds";
import { ALLOCATED_STORAGE_GB, DB_INSTANCE_CLASS, DB_REFRESH_INTERVAL_MS } from "../constants.ts";
import { isSupportedEngine, isTransitional } from "../databases.ts";
import type { NewDatabase } from "../schemas.ts";
import { useRDS } from "./useRDS.ts";

// Mọi query của RDS nằm dưới key gốc này
const RDS_QUERY_ROOT = "rds";
const databasesQueryKey = [RDS_QUERY_ROOT, "databases"];
const databaseQueryKey = (id: string) => [RDS_QUERY_ROOT, "database", id];

// Instance của cluster Aurora và engine khác không thuộc phạm vi
export function useDatabases() {
  const client = useRDS();

  return useQuery({
    queryKey: databasesQueryKey,
    queryFn: async () => {
      const databases: DBInstance[] = [];

      for await (const page of paginateDescribeDBInstances({ client }, {})) {
        databases.push(...(page.DBInstances ?? []));
      }

      return databases.filter((database) => isSupportedEngine(database.Engine));
    },
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? DB_REFRESH_INTERVAL_MS : false,
  });
}

export function useDatabase(id: string) {
  const client = useRDS();

  return useQuery({
    queryKey: databaseQueryKey(id),
    queryFn: async () => {
      const { DBInstances = [] } = await client.send(
        new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }),
      );
      return DBInstances[0] ?? null;
    },
    retry: false,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? DB_REFRESH_INTERVAL_MS : false,
  });
}

export function useCreateDatabase() {
  const client = useRDS();
  const queryClient = useQueryClient();

  return useMutation({
    // Floci tạo đồng bộ: trả về khi container DB đã chạy (spec 7 #1)
    mutationFn: (database: NewDatabase) =>
      client.send(
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
          // Mặc định không mã hóa (như trước); bật thì key trống = aws/rds
          ...(database.storageEncrypted
            ? { StorageEncrypted: true, KmsKeyId: database.kmsKeyId || undefined }
            : {}),
          DBName: database.databaseName || undefined,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: databasesQueryKey }),
  });
}

export const DATABASE_ACTIONS = {
  stop: "stop",
  start: "start",
  reboot: "reboot",
  delete: "delete",
} as const;
export type DatabaseAction = (typeof DATABASE_ACTIONS)[keyof typeof DATABASE_ACTIONS];

export function useDatabaseAction() {
  const client = useRDS();
  const queryClient = useQueryClient();

  const send = (id: string, action: DatabaseAction) => {
    const input = { DBInstanceIdentifier: id };

    switch (action) {
      case DATABASE_ACTIONS.stop:
        return client.send(new StopDBInstanceCommand(input));
      case DATABASE_ACTIONS.start:
        return client.send(new StartDBInstanceCommand(input));
      case DATABASE_ACTIONS.reboot:
        return client.send(new RebootDBInstanceCommand(input));
      case DATABASE_ACTIONS.delete:
        return client.send(new DeleteDBInstanceCommand({ ...input, SkipFinalSnapshot: true }));
    }
  };

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: DatabaseAction }) => send(id, action),
    // Xóa thì Floci bỏ DB ngay: tải lại chi tiết sẽ ra 404 (console.error) trước khi trang rời đi
    onSuccess: (_result, { action }) =>
      queryClient.invalidateQueries({
        queryKey: action === DATABASE_ACTIONS.delete ? databasesQueryKey : [RDS_QUERY_ROOT],
      }),
  });
}
