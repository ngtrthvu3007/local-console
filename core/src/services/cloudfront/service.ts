import type { CloudFrontClient, DistributionConfig } from "@aws-sdk/client-cloudfront";
import {
  createDistribution,
  deleteDistribution,
  getDistribution,
  listDistributions,
  updateDistribution,
} from "./operations/distributions.ts";
import { createInvalidation, listInvalidations } from "./operations/invalidations.ts";
import { listPolicyNames } from "./operations/policies.ts";

// CloudFront là dữ liệu toàn cục: Floci trả cùng danh sách dù ký bằng region nào (spec 7 #13)
export function createCloudFrontService(cloudfront: CloudFrontClient) {
  return {
    listDistributions: () => listDistributions(cloudfront),
    getDistribution: (id: string) => getDistribution(cloudfront, id),
    createDistribution: (config: DistributionConfig) => createDistribution(cloudfront, config),
    updateDistribution: (id: string, change: (config: DistributionConfig) => DistributionConfig) =>
      updateDistribution(cloudfront, id, change),
    deleteDistribution: (id: string) => deleteDistribution(cloudfront, id),
    listInvalidations: (id: string) => listInvalidations(cloudfront, id),
    createInvalidation: (id: string, paths: readonly string[]) =>
      createInvalidation(cloudfront, id, paths),
    listPolicyNames: () => listPolicyNames(cloudfront),
  };
}
