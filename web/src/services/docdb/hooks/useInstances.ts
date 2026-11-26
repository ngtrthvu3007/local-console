import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateDBInstanceCommand, DeleteDBInstanceCommand } from "@aws-sdk/client-rds";
import { runEach } from "@shared/hooks/useNotify.ts";
import { useRDS } from "../../rds/hooks/useRDS.ts";
import { DOCDB_ENGINE } from "../constants.ts";
import { clustersKey } from "./useClusters.ts";

// Instance của DocumentDB trên Floci chỉ là bản ghi, không bật thêm container (spec 7 #3)
export function useAddInstance(cluster: string) {
  const client = useRDS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: { identifier: string; instanceClass: string }) =>
      client.send(
        new CreateDBInstanceCommand({
          DBInstanceIdentifier: values.identifier,
          DBClusterIdentifier: cluster,
          Engine: DOCDB_ENGINE,
          DBInstanceClass: values.instanceClass,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}

export function useDeleteInstances() {
  const client = useRDS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      runEach(
        ids,
        (id) => id,
        (id) => client.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id })),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}
