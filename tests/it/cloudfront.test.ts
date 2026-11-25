import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateInvalidationCommand,
  DeleteDistributionCommand,
  GetDistributionConfigCommand,
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
  UpdateDistributionCommand,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

// Hành vi CloudFront của Floci mà trang CloudFront dựa vào (spec CloudFront mục 7): phục vụ file thật ở
// URL local, SPA, behavior sang origin khác, ETag, invalidation, tắt / xóa

const MANAGED_CACHING_OPTIMIZED_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HOME = "<h1>home</h1>";
const PING = "pong";

const site = uniqueName("cfsite");
const api = uniqueName("cfapi");
const objects = [
  { Bucket: site, Key: "index.html", Body: HOME },
  { Bucket: api, Key: "api/ping.txt", Body: PING },
];

let cf: CloudFrontClient;
let s3: S3Client;
let region = "";
let flociPublicUrl = "";
let id = "";

// Như localUrl của console: host cố định, port của Floci
const localUrl = (path = "") => {
  const url = new URL(flociPublicUrl);
  url.hostname = `${id.toLowerCase()}.cloudfront.localhost`;
  return `${url.origin}/${path}`;
};
const domainOf = (bucket: string) => `${bucket}.s3.${region}.amazonaws.com`;

async function update(change: (config: DistributionConfig) => DistributionConfig) {
  const { DistributionConfig: config, ETag } = await cf.send(
    new GetDistributionConfigCommand({ Id: id }),
  );
  if (!config) throw new Error("no config");
  return cf.send(
    new UpdateDistributionCommand({ Id: id, IfMatch: ETag, DistributionConfig: change(config) }),
  );
}

beforeAll(async () => {
  ({ region, flociPublicUrl } = await consoleConfig());
  cf = new CloudFrontClient(viaConsole(region));
  s3 = new S3Client({ ...viaConsole(region), forcePathStyle: true });
  for (const Bucket of [site, api]) await s3.send(new CreateBucketCommand({ Bucket }));
  for (const object of objects) await s3.send(new PutObjectCommand(object));

  const origin = domainOf(site);
  const { Distribution } = await cf.send(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: uniqueName("cf"),
        Comment: "",
        Enabled: true,
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [{ Id: origin, DomainName: origin, S3OriginConfig: { OriginAccessIdentity: "" } }],
        },
        DefaultCacheBehavior: {
          TargetOriginId: origin,
          ViewerProtocolPolicy: "allow-all",
          CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
        },
      },
    }),
  );
  id = Distribution?.Id ?? "";
});

afterAll(async () => {
  const current = await cf
    .send(new GetDistributionConfigCommand({ Id: id }))
    .catch(() => undefined);
  if (current?.DistributionConfig?.Enabled)
    await update((config) => ({ ...config, Enabled: false }));
  const latest = await cf.send(new GetDistributionConfigCommand({ Id: id })).catch(() => undefined);
  if (latest) await cf.send(new DeleteDistributionCommand({ Id: id, IfMatch: latest.ETag }));
  for (const { Bucket, Key } of objects) await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  for (const Bucket of [site, api]) await s3.send(new DeleteBucketCommand({ Bucket }));
});

describe("cloudfront", () => {
  it("serves the default root object at the local URL", async () => {
    const response = await fetch(localUrl());
    expect(await response.text()).toBe(HOME);
  });

  it("serves the root object for client-side routes once SPA error pages are set", async () => {
    await update((config) => ({
      ...config,
      CustomErrorResponses: {
        Quantity: 2,
        Items: [403, 404].map((ErrorCode) => ({
          ErrorCode,
          ResponsePagePath: "/index.html",
          ResponseCode: "200",
        })),
      },
    }));
    const response = await fetch(localUrl("deep/link"));
    expect(response.status).toBe(HTTP_OK);
    expect(await response.text()).toBe(HOME);
  });

  it("sends /api/* to a second origin", async () => {
    const origin = domainOf(api);
    await update((config) => ({
      ...config,
      Origins: {
        Quantity: 2,
        Items: [
          ...(config.Origins?.Items ?? []),
          { Id: origin, DomainName: origin, S3OriginConfig: { OriginAccessIdentity: "" } },
        ],
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/api/*",
            TargetOriginId: origin,
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
          },
        ],
      },
    }));
    expect(await (await fetch(localUrl("api/ping.txt"))).text()).toBe(PING);
  });

  it("rejects an update with a stale ETag", async () => {
    const { DistributionConfig: config, ETag } = await cf.send(
      new GetDistributionConfigCommand({ Id: id }),
    );
    await update((current) => ({ ...current, Comment: "changed elsewhere" }));
    await expect(
      cf.send(new UpdateDistributionCommand({ Id: id, IfMatch: ETag, DistributionConfig: config })),
    ).rejects.toMatchObject({ name: "InvalidIfMatchVersion" });
  });

  it("completes an invalidation at once", async () => {
    const { Invalidation } = await cf.send(
      new CreateInvalidationCommand({
        DistributionId: id,
        InvalidationBatch: {
          CallerReference: uniqueName("inv"),
          Paths: { Quantity: 1, Items: ["/*"] },
        },
      }),
    );
    expect(Invalidation?.Status).toBe("Completed");
  });

  it("names managed policies", async () => {
    const { CachePolicyList } = await cf.send(new ListCachePoliciesCommand({}));
    const optimized = CachePolicyList?.Items?.find(
      (item) => item.CachePolicy?.Id === MANAGED_CACHING_OPTIMIZED_ID,
    );
    expect(optimized?.CachePolicy?.CachePolicyConfig?.Name).toBe("Managed-CachingOptimized");

    const { OriginRequestPolicyList } = await cf.send(new ListOriginRequestPoliciesCommand({}));
    expect(OriginRequestPolicyList?.Items?.length).toBeGreaterThan(0);
    const { ResponseHeadersPolicyList } = await cf.send(new ListResponseHeadersPoliciesCommand({}));
    expect(ResponseHeadersPolicyList?.Items?.length).toBeGreaterThan(0);
  });

  it("only deletes a disabled distribution, and a disabled one answers 404", async () => {
    const { ETag } = await cf.send(new GetDistributionConfigCommand({ Id: id }));
    await expect(
      cf.send(new DeleteDistributionCommand({ Id: id, IfMatch: ETag })),
    ).rejects.toMatchObject({
      name: "DistributionNotDisabled",
    });

    const disabled = await update((config) => ({ ...config, Enabled: false }));
    expect((await fetch(localUrl())).status).toBe(HTTP_NOT_FOUND);
    await cf.send(new DeleteDistributionCommand({ Id: id, IfMatch: disabled.ETag }));
  });
});
