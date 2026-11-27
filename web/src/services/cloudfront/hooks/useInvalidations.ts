import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CLOUDFRONT_QUERY_ROOT } from "./useDistributions.ts";
import { useCloudFrontService } from "./useCloudFrontService.ts";

const invalidationsQueryKey = (id: string) => [CLOUDFRONT_QUERY_ROOT, "invalidations", id];

export function useInvalidations(id: string) {
  const cloudfront = useCloudFrontService();

  return useQuery({
    queryKey: invalidationsQueryKey(id),
    queryFn: () => cloudfront.listInvalidations(id),
  });
}

export function useCreateInvalidation(id: string) {
  const cloudfront = useCloudFrontService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paths: string[]) => cloudfront.createInvalidation(id, paths),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invalidationsQueryKey(id) }),
  });
}
