import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NewInstance } from "@localconsole/core/docdb";
import { clustersKey } from "./useClusters.ts";
import { useDocDbService } from "./useDocDbService.ts";

export function useAddInstance(cluster: string) {
  const docdb = useDocDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instance: NewInstance) => docdb.addInstance(cluster, instance),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}

export function useDeleteInstances() {
  const docdb = useDocDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: docdb.deleteInstances,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}
