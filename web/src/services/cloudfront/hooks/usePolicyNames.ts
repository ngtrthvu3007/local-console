import { useQuery } from "@tanstack/react-query";
import {
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
} from "@aws-sdk/client-cloudfront";
import { CLOUDFRONT_QUERY_ROOT } from "./useDistributions.ts";
import { useCloudFront } from "./useCloudFront.ts";

export interface PolicyNames {
  cache: Map<string, string>;
  originRequest: Map<string, string>;
  responseHeaders: Map<string, string>;
}

const namesOf = (pairs: { id?: string; name?: string }[]) =>
  new Map(pairs.flatMap(({ id, name }) => (id && name ? [[id, name] as const] : [])));

// Tên policy (managed và custom) tra theo ID; mỗi loại một lần gọi: local chỉ có vài chục policy
export function usePolicyNames() {
  const client = useCloudFront();

  return useQuery({
    queryKey: [CLOUDFRONT_QUERY_ROOT, "policy-names"],
    queryFn: async (): Promise<PolicyNames> => {
      const [cache, originRequest, responseHeaders] = await Promise.all([
        client.send(new ListCachePoliciesCommand({})),
        client.send(new ListOriginRequestPoliciesCommand({})),
        client.send(new ListResponseHeadersPoliciesCommand({})),
      ]);

      return {
        cache: namesOf(
          (cache.CachePolicyList?.Items ?? []).map(({ CachePolicy }) => ({
            id: CachePolicy?.Id,
            name: CachePolicy?.CachePolicyConfig?.Name,
          })),
        ),
        originRequest: namesOf(
          (originRequest.OriginRequestPolicyList?.Items ?? []).map(({ OriginRequestPolicy }) => ({
            id: OriginRequestPolicy?.Id,
            name: OriginRequestPolicy?.OriginRequestPolicyConfig?.Name,
          })),
        ),
        responseHeaders: namesOf(
          (responseHeaders.ResponseHeadersPolicyList?.Items ?? []).map(
            ({ ResponseHeadersPolicy }) => ({
              id: ResponseHeadersPolicy?.Id,
              name: ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name,
            }),
          ),
        ),
      };
    },
  });
}
