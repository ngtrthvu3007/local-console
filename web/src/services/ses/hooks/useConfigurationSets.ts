import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EventDestination } from "@aws-sdk/client-sesv2";
import type { DestinationChange, SesService } from "@localconsole/core/ses";
import { useSesService } from "./useSesService.ts";

const SETS_ROOT = "ses-configuration-sets";
const configurationSetsQueryKey = [SETS_ROOT];
const destinationsKey = (name: string) => [SETS_ROOT, name, "destinations"];

export function useConfigurationSets() {
  const ses = useSesService();

  return useQuery({ queryKey: configurationSetsQueryKey, queryFn: ses.listConfigurationSets });
}

const destinationsQuery = (ses: SesService, name: string) => ({
  queryKey: destinationsKey(name),
  queryFn: () => ses.listEventDestinations(name),
  retry: false,
});

export function useEventDestinations(name: string) {
  return useQuery(destinationsQuery(useSesService(), name));
}

// Cùng key với panel nên dùng chung cache
export function useAllEventDestinations(names: readonly string[]) {
  const ses = useSesService();
  const results = useQueries({ queries: names.map((name) => destinationsQuery(ses, name)) });

  return new Map<string, EventDestination[] | undefined>(
    names.map((name, index) => [name, results[index].data]),
  );
}

export function useCreateConfigurationSet() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => ses.createConfigurationSet(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configurationSetsQueryKey }),
  });
}

export function useDeleteConfigurationSets() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => ses.deleteConfigurationSets(names),
    // Không đọc lại destination của set vừa xóa (404)
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: configurationSetsQueryKey, exact: true }),
  });
}

function useDestinationMutation(send: (change: DestinationChange) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: (_result, change) =>
      queryClient.invalidateQueries({ queryKey: destinationsKey(change.set) }),
  });
}

export function useAddDestination() {
  const ses = useSesService();
  return useDestinationMutation(ses.addEventDestination);
}

export function useUpdateDestination() {
  const ses = useSesService();
  return useDestinationMutation(ses.updateEventDestination);
}

export function useDeleteDestination(set: string) {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => ses.deleteEventDestination(set, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: destinationsKey(set) }),
  });
}
