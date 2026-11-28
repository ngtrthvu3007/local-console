import { useQuery } from "@tanstack/react-query";
import { CLOUDFRONT_QUERY_ROOT } from "./useDistributions.ts";
import { useCloudFrontService } from "./useCloudFrontService.ts";

export function usePolicyNames() {
  const cloudfront = useCloudFrontService();

  return useQuery({
    queryKey: [CLOUDFRONT_QUERY_ROOT, "policy-names"],
    queryFn: cloudfront.listPolicyNames,
  });
}
