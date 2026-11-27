import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isTransitional, type InstanceActionInput } from "@localconsole/core/ec2";
import { INSTANCE_POLL_INTERVAL_MS } from "../constants.ts";
import { useEc2Service } from "./useEc2Service.ts";

// Mọi query của EC2 nằm dưới key gốc này
const EC2_QUERY_ROOT = "ec2";
const instancesQueryKey = [EC2_QUERY_ROOT, "instances"];
const instanceQueryKey = (id: string) => [EC2_QUERY_ROOT, "instance", id];

export function useInstances() {
  const ec2 = useEc2Service();

  return useQuery({
    queryKey: instancesQueryKey,
    queryFn: ec2.listInstances,
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? INSTANCE_POLL_INTERVAL_MS : false,
  });
}

export function useInstance(id: string) {
  const ec2 = useEc2Service();

  return useQuery({
    queryKey: instanceQueryKey(id),
    queryFn: () => ec2.getInstance(id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? INSTANCE_POLL_INTERVAL_MS : false,
  });
}

export function useUserData(id: string) {
  const ec2 = useEc2Service();

  return useQuery({
    queryKey: [...instanceQueryKey(id), "user-data"],
    queryFn: () => ec2.getUserData(id),
  });
}

export function useLaunchInstance() {
  const ec2 = useEc2Service();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ec2.launchInstance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: instancesQueryKey }),
  });
}

export function useInstanceAction() {
  const ec2 = useEc2Service();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InstanceActionInput) => ec2.runInstanceAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EC2_QUERY_ROOT] }),
  });
}
