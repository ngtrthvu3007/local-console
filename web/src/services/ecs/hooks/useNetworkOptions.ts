import { useQuery } from "@tanstack/react-query";
import { useEc2Service } from "../../ec2/hooks/useEc2Service.ts";
import { ECS_QUERY_ROOT } from "./useEcsService.ts";

export function useNetworkOptions() {
  const ec2 = useEc2Service();

  return useQuery({ queryKey: [ECS_QUERY_ROOT, "network"], queryFn: ec2.listNetworkOptions });
}
