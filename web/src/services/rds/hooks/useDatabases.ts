import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DATABASE_ACTIONS, isTransitional, type DatabaseActionInput } from "@localconsole/core/rds";
import { DB_REFRESH_INTERVAL_MS } from "../constants.ts";
import { useRdsService } from "./useRdsService.ts";

// Mọi query của RDS nằm dưới key gốc này
const RDS_QUERY_ROOT = "rds";
const databasesQueryKey = [RDS_QUERY_ROOT, "databases"];
const databaseQueryKey = (id: string) => [RDS_QUERY_ROOT, "database", id];

export function useDatabases() {
  const rds = useRdsService();

  return useQuery({
    queryKey: databasesQueryKey,
    queryFn: rds.listDatabases,
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? DB_REFRESH_INTERVAL_MS : false,
  });
}

export function useDatabase(id: string) {
  const rds = useRdsService();

  return useQuery({
    queryKey: databaseQueryKey(id),
    queryFn: () => rds.getDatabase(id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? DB_REFRESH_INTERVAL_MS : false,
  });
}

export function useCreateDatabase() {
  const rds = useRdsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rds.createDatabase,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: databasesQueryKey }),
  });
}

export function useDatabaseAction() {
  const rds = useRdsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DatabaseActionInput) => rds.runDatabaseAction(input),
    // Xóa thì Floci bỏ DB ngay: tải lại chi tiết sẽ ra 404 (console.error) trước khi trang rời đi
    onSuccess: (_result, { action }) =>
      queryClient.invalidateQueries({
        queryKey: action === DATABASE_ACTIONS.delete ? databasesQueryKey : [RDS_QUERY_ROOT],
      }),
  });
}
