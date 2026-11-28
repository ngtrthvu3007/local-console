import { useQuery } from "@tanstack/react-query";
import { useFlociService } from "./useFlociService.ts";

const flociInfoQueryKey = ["floci-info"];

export function useFlociInfo() {
  const floci = useFlociService();

  return useQuery({ queryKey: flociInfoQueryKey, queryFn: floci.getInfo });
}
