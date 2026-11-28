import {
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
  type CloudFrontClient,
} from "@aws-sdk/client-cloudfront";

export interface PolicyNames {
  cache: Map<string, string>;
  originRequest: Map<string, string>;
  responseHeaders: Map<string, string>;
}

const namesOf = (pairs: { id?: string; name?: string }[]) =>
  new Map(pairs.flatMap(({ id, name }) => (id && name ? [[id, name] as const] : [])));

// Mỗi loại một lần gọi, không phân trang: local chỉ có vài chục policy
export async function listPolicyNames(cloudfront: CloudFrontClient): Promise<PolicyNames> {
  const [cache, originRequest, responseHeaders] = await Promise.all([
    cloudfront.send(new ListCachePoliciesCommand({})),
    cloudfront.send(new ListOriginRequestPoliciesCommand({})),
    cloudfront.send(new ListResponseHeadersPoliciesCommand({})),
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
      (responseHeaders.ResponseHeadersPolicyList?.Items ?? []).map(({ ResponseHeadersPolicy }) => ({
        id: ResponseHeadersPolicy?.Id,
        name: ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name,
      })),
    ),
  };
}
