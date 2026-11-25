import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateInvalidationCommand,
  paginateListInvalidations,
  type InvalidationSummary,
} from "@aws-sdk/client-cloudfront";
import { CLOUDFRONT_QUERY_ROOT } from "./useDistributions.ts";
import { useCloudFront } from "./useCloudFront.ts";

const invalidationsQueryKey = (id: string) => [CLOUDFRONT_QUERY_ROOT, "invalidations", id];

export function useInvalidations(id: string) {
  const client = useCloudFront();

  return useQuery({
    queryKey: invalidationsQueryKey(id),
    queryFn: async () => {
      const invalidations: InvalidationSummary[] = [];
      for await (const page of paginateListInvalidations({ client }, { DistributionId: id })) {
        invalidations.push(...(page.InvalidationList?.Items ?? []));
      }
      return invalidations;
    },
  });
}

export function useCreateInvalidation(id: string) {
  const client = useCloudFront();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paths: string[]) => {
      const { Invalidation } = await client.send(
        new CreateInvalidationCommand({
          DistributionId: id,
          InvalidationBatch: {
            CallerReference: crypto.randomUUID(),
            Paths: { Quantity: paths.length, Items: paths },
          },
        }),
      );
      return Invalidation?.Id ?? "";
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invalidationsQueryKey(id) }),
  });
}
