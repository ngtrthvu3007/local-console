import {
  CreateInvalidationCommand,
  paginateListInvalidations,
  type CloudFrontClient,
} from "@aws-sdk/client-cloudfront";
import { collectPages } from "#shared/aws/pagination.ts";

export const listInvalidations = (cloudfront: CloudFrontClient, id: string) =>
  collectPages(
    paginateListInvalidations({ client: cloudfront }, { DistributionId: id }),
    (page) => page.InvalidationList?.Items,
  );

export async function createInvalidation(
  cloudfront: CloudFrontClient,
  id: string,
  paths: readonly string[],
) {
  const { Invalidation } = await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: id,
      InvalidationBatch: {
        CallerReference: crypto.randomUUID(),
        Paths: { Quantity: paths.length, Items: [...paths] },
      },
    }),
  );
  return Invalidation?.Id ?? "";
}
