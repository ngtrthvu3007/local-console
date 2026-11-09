import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateBrokerCommand,
  DeleteBrokerCommand,
  DescribeBrokerCommand,
  RebootBrokerCommand,
  paginateListBrokers,
  type BrokerSummary,
  type DescribeBrokerResponse,
} from "@aws-sdk/client-mq";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  BROKER_REFRESH_INTERVAL_MS,
  BROKER_RUNNING,
  DEPLOYMENT_MODE,
  ENGINE_TYPE,
  ENGINE_VERSION,
  FAILED_STATES,
  HOST_INSTANCE_TYPE,
} from "../constants.ts";
import { useMQ } from "./useMQ.ts";

const brokersQueryKey = ["mq", "brokers"];
const brokerQueryKey = (broker: string) => ["mq", "broker", broker];

export const isTransitional = (state?: string) =>
  Boolean(state) && state !== BROKER_RUNNING && !FAILED_STATES.includes(state!);

const refreshWhileTransitional = (states: (string | undefined)[]) =>
  states.some(isTransitional) ? BROKER_REFRESH_INTERVAL_MS : false;

export function useBrokers() {
  const client = useMQ();
  return useQuery({
    queryKey: brokersQueryKey,
    queryFn: async () => {
      const brokers: BrokerSummary[] = [];
      for await (const page of paginateListBrokers({ client }, {})) {
        brokers.push(...(page.BrokerSummaries ?? []));
      }
      return brokers;
    },
    refetchInterval: (query) =>
      refreshWhileTransitional((query.state.data ?? []).map((broker) => broker.BrokerState)),
  });
}

export function useBroker(broker: string) {
  const client = useMQ();
  return useQuery({
    queryKey: brokerQueryKey(broker),
    queryFn: (): Promise<DescribeBrokerResponse> =>
      client.send(new DescribeBrokerCommand({ BrokerId: broker })),
    retry: false,
    refetchInterval: (query) => refreshWhileTransitional([query.state.data?.BrokerState]),
  });
}

export interface CreateBrokerInput {
  name: string;
  username: string;
  password: string;
}

export function useCreateBroker() {
  const client = useMQ();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, username, password }: CreateBrokerInput) =>
      client.send(
        new CreateBrokerCommand({
          BrokerName: name,
          EngineType: ENGINE_TYPE,
          EngineVersion: ENGINE_VERSION,
          HostInstanceType: HOST_INSTANCE_TYPE,
          DeploymentMode: DEPLOYMENT_MODE,
          PubliclyAccessible: false,
          AutoMinorVersionUpgrade: true,
          Users: [{ Username: username, Password: password }],
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
  });
}

export interface BrokerRef {
  id: string;
  name: string;
}

export function useDeleteBrokers() {
  const client = useMQ();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (brokers: BrokerRef[]) => {
      const failures: string[] = [];
      for (const broker of brokers) {
        try {
          await client.send(new DeleteBrokerCommand({ BrokerId: broker.id }));
        } catch (error) {
          failures.push(`${broker.name}: ${errorMessage(error)}`);
        }
      }
      return { count: brokers.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
  });
}

export function useRebootBroker(broker: string) {
  const client = useMQ();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.send(new RebootBrokerCommand({ BrokerId: broker })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: brokerQueryKey(broker) }),
        queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
      ]),
  });
}
