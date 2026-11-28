import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FamilyStatus } from "@localconsole/core/ecs";
import { ECS_QUERY_ROOT, useEcsService } from "./useEcsService.ts";

const taskDefinitionsKey = [ECS_QUERY_ROOT, "taskDefinitions"];

export function useFamilies(status: FamilyStatus) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "families", status],
    queryFn: () => ecs.listFamilies(status),
  });
}

export function useRevisions(family: string) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "revisions", family],
    queryFn: () => ecs.listRevisions(family),
    enabled: Boolean(family),
  });
}

export function useTaskDefinition(family: string, revision?: number) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "detail", family, revision],
    queryFn: () => (revision === undefined ? null : ecs.getTaskDefinition(family, revision)),
    enabled: Boolean(family),
  });
}

export function useRegisterTaskDefinition() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.registerTaskDefinition,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}

export function useDeregisterRevisions() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.deregisterRevisions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}

export function useDeleteRevisions() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.deleteRevisions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}
