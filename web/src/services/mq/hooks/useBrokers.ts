import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BROKER_REFRESH_INTERVAL_MS,
  BROKER_RUNNING,
  FAILED_STATES,
  type BrokerRef,
  type CreateBrokerInput,
} from "@localconsole/core/mq";
import { useMqService } from "./useMqService.ts";

export type { BrokerRef };

const brokersQueryKey = ["mq", "brokers"];
const brokerQueryKey = (broker: string) => ["mq", "broker", broker];

export const isTransitional = (state?: string) =>
  Boolean(state) && state !== BROKER_RUNNING && !FAILED_STATES.includes(state!);

const refreshWhileTransitional = (states: (string | undefined)[]) =>
  states.some(isTransitional) ? BROKER_REFRESH_INTERVAL_MS : false;

export function useBrokers() {
  const mq = useMqService();

  return useQuery({
    queryKey: brokersQueryKey,
    queryFn: mq.listBrokers,
    refetchInterval: (query) =>
      refreshWhileTransitional((query.state.data ?? []).map((broker) => broker.BrokerState)),
  });
}

export function useBroker(broker: string) {
  const mq = useMqService();

  return useQuery({
    queryKey: brokerQueryKey(broker),
    queryFn: () => mq.getBroker(broker),
    retry: false,
    refetchInterval: (query) => refreshWhileTransitional([query.state.data?.BrokerState]),
  });
}

export function useCreateBroker() {
  const mq = useMqService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBrokerInput) => mq.createBroker(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
  });
}

export function useDeleteBrokers() {
  const mq = useMqService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (brokers: BrokerRef[]) => mq.deleteBrokers(brokers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
  });
}

export function useRebootBroker(broker: string) {
  const mq = useMqService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => mq.rebootBroker(broker),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: brokerQueryKey(broker) }),
        queryClient.invalidateQueries({ queryKey: brokersQueryKey }),
      ]),
  });
}
