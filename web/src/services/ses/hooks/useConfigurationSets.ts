import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  DeleteConfigurationSetCommand,
  DeleteConfigurationSetEventDestinationCommand,
  GetConfigurationSetEventDestinationsCommand,
  paginateListConfigurationSets,
  UpdateConfigurationSetEventDestinationCommand,
  type EventDestination,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";
import { runEach } from "@shared/hooks/useNotify.ts";
import { toDefinition, type DestinationInput } from "../configurationSets.ts";
import { useSES } from "./useSES.ts";

const SETS_ROOT = "ses-configuration-sets";
export const configurationSetsQueryKey = [SETS_ROOT];
const destinationsKey = (name: string) => [SETS_ROOT, name, "destinations"];

export function useConfigurationSets() {
  const client = useSES();
  return useQuery({
    queryKey: configurationSetsQueryKey,
    queryFn: async () => {
      const names: string[] = [];
      for await (const page of paginateListConfigurationSets({ client }, {}))
        names.push(...(page.ConfigurationSets ?? []));
      return names;
    },
  });
}

const destinationsQuery = (client: SESv2Client, name: string) => ({
  queryKey: destinationsKey(name),
  queryFn: async () =>
    (
      await client.send(
        new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: name }),
      )
    ).EventDestinations ?? [],
  retry: false,
});

export function useEventDestinations(name: string) {
  return useQuery(destinationsQuery(useSES(), name));
}

// Một lần cho cả bảng: tên set → destination (cùng key với panel nên dùng chung cache)
export function useAllEventDestinations(names: readonly string[]) {
  const client = useSES();
  const results = useQueries({ queries: names.map((name) => destinationsQuery(client, name)) });
  return new Map<string, EventDestination[] | undefined>(
    names.map((name, index) => [name, results[index].data]),
  );
}

export function useCreateConfigurationSet() {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      client.send(new CreateConfigurationSetCommand({ ConfigurationSetName: name })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configurationSetsQueryKey }),
  });
}

export function useDeleteConfigurationSets() {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) =>
      runEach(
        names,
        (name) => name,
        (name) => client.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: name })),
      ),
    // Chỉ đọc lại danh sách tên, không đọc lại destination của set vừa xóa (404)
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: configurationSetsQueryKey, exact: true }),
  });
}

interface DestinationChange {
  set: string;
  name: string;
  input: DestinationInput;
}

type Sender =
  | typeof CreateConfigurationSetEventDestinationCommand
  | typeof UpdateConfigurationSetEventDestinationCommand;

function useDestinationMutation(Command: Sender) {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ set, name, input }: DestinationChange) =>
      client.send(
        new Command({
          ConfigurationSetName: set,
          EventDestinationName: name,
          EventDestination: toDefinition(input),
        }),
      ),
    onSuccess: (_result, change) =>
      queryClient.invalidateQueries({ queryKey: destinationsKey(change.set) }),
  });
}

export const useAddDestination = () =>
  useDestinationMutation(CreateConfigurationSetEventDestinationCommand);
export const useUpdateDestination = () =>
  useDestinationMutation(UpdateConfigurationSetEventDestinationCommand);

export function useDeleteDestination(set: string) {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      client.send(
        new DeleteConfigurationSetEventDestinationCommand({
          ConfigurationSetName: set,
          EventDestinationName: name,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: destinationsKey(set) }),
  });
}
