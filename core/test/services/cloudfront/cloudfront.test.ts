import { describe, expect, it } from "vitest";
import { MANAGED_CACHING_OPTIMIZED_ID } from "#services/cloudfront/constants.ts";
import {
  behaviorsOf,
  behaviorsUsing,
  bucketOfOriginDomain,
  distributionsServing,
  errorResponsesOf,
  isSpa,
  localUrl,
  moveBehavior,
  newDistributionConfig,
  originFromForm,
  originTypeOf,
  originsOf,
  s3OriginDomain,
  withBehavior,
  withEnabled,
  withOrigin,
  withoutBehavior,
  withoutOrigin,
  withSettings,
} from "#services/cloudfront/distributions.ts";
import {
  behaviorSchema,
  createDistributionSchema,
  invalidationSchema,
  originSchema,
  settingsSchema,
} from "#services/cloudfront/schemas.ts";
import { DISTRIBUTION_TABS, cloudfrontRoutes } from "#services/cloudfront/paths.ts";
import { fixture } from "./fixture.ts";

const REGION = "ap-southeast-1";
const SITE = "my.site.s3.ap-southeast-1.amazonaws.com";

const customForm = {
  type: "custom",
  bucket: "",
  domain: "api.example.com",
  protocol: "https-only",
  port: "443",
  path: "",
  id: "api2",
} as const;

const bare = () =>
  newDistributionConfig({
    bucket: "b",
    region: REGION,
    defaultRootObject: "index.html",
    spa: false,
    description: "",
  });

describe("cloudfront", () => {
  it("builds the local URL on the Floci port, never its host", () => {
    expect(localUrl("http://localhost:4566", "E2ABC")).toBe(
      "http://e2abc.cloudfront.localhost:4566/",
    );
    expect(localUrl("http://127.0.0.1:4599", "E2ABC")).toBe(
      "http://e2abc.cloudfront.localhost:4599/",
    );
  });

  it("finds the Floci bucket of an origin domain", () => {
    expect(s3OriginDomain("my.site", REGION)).toBe(SITE);
    expect(bucketOfOriginDomain(SITE)).toBe("my.site");
    expect(bucketOfOriginDomain("assets.s3.amazonaws.com")).toBe("assets");
    expect(bucketOfOriginDomain("site.s3-website-ap-southeast-1.amazonaws.com")).toBeUndefined();
    expect(bucketOfOriginDomain("api.example.com")).toBeUndefined();
  });

  it("keeps fields the console doesn't show", () => {
    const [site] = originsOf(fixture);
    const edited = withOrigin(fixture, {
      Id: site.Id,
      DomainName: site.DomainName,
      OriginPath: "/v2",
    });
    expect(originsOf(edited)[0]).toMatchObject({
      OriginPath: "/v2",
      OriginAccessControlId: site.OriginAccessControlId,
      ConnectionAttempts: 3,
    });

    const api = withOrigin(
      fixture,
      {
        Id: "api",
        DomainName: "api.example.com",
        CustomOriginConfig: { HTTPPort: 8080, HTTPSPort: 443, OriginProtocolPolicy: "http-only" },
      },
      { replace: true },
    );
    expect(originsOf(api)[1]).toMatchObject({
      CustomHeaders: fixture.Origins.Items[1].CustomHeaders,
      CustomOriginConfig: {
        HTTPPort: 8080,
        OriginProtocolPolicy: "http-only",
        OriginReadTimeout: 30,
      },
    });

    const moved = withBehavior(fixture, { originalPath: "/api/*", path: "/v1/*", originId: "api" });
    expect(behaviorsOf(moved)[0]).toMatchObject({
      PathPattern: "/v1/*",
      FunctionAssociations: fixture.CacheBehaviors.Items[0].FunctionAssociations,
      CachePolicyId: fixture.CacheBehaviors.Items[0].CachePolicyId,
    });
    expect(withEnabled(fixture, false)).toMatchObject({ Enabled: false, Logging: fixture.Logging });
  });

  it("keeps Quantity equal to Items, also when Floci omits empty Items", () => {
    const withApi = withBehavior(bare(), { path: "/api/*", originId: s3OriginDomain("b", REGION) });
    expect(withApi.CacheBehaviors).toMatchObject({ Quantity: 1 });
    expect(behaviorsOf(withApi)[0]).toMatchObject({
      CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
      ViewerProtocolPolicy: "allow-all",
    });
    expect(withoutBehavior(withApi, "/api/*").CacheBehaviors).toEqual({ Quantity: 0, Items: [] });
    expect(errorResponsesOf({ ...bare(), CustomErrorResponses: { Quantity: 0 } })).toEqual([]);
    expect(withoutOrigin(fixture, "api").Origins).toMatchObject({ Quantity: 1 });
  });

  it("points SPA error pages at the new root object and keeps other codes", () => {
    const spa = withSettings(fixture, {
      description: "",
      defaultRootObject: "app.html",
      spa: true,
    });
    expect(errorResponsesOf(spa).filter((r) => r.ResponsePagePath === "/app.html")).toHaveLength(2);
    expect(isSpa(spa)).toBe(true);
    expect(isSpa(fixture)).toBe(false);

    const off = withSettings(spa, { description: "", defaultRootObject: "app.html", spa: false });
    expect(errorResponsesOf(off).map((r) => r.ErrorCode)).toEqual([500]);
  });

  it("keeps error pages when only the description changes", () => {
    const only403 = {
      ...fixture,
      CustomErrorResponses: {
        Quantity: 1,
        Items: [{ ErrorCode: 403, ResponsePagePath: "/index.html", ResponseCode: "200" }],
      },
    };
    const kept = withSettings(only403, {
      description: "new",
      defaultRootObject: "index.html",
      spa: false,
    });
    expect(kept.CustomErrorResponses).toEqual(only403.CustomErrorResponses);

    const nested = {
      ...fixture,
      CustomErrorResponses: {
        Quantity: 2,
        Items: [403, 404].map((ErrorCode) => ({
          ErrorCode,
          ResponsePagePath: "/app/index.html",
          ResponseCode: "200",
          ErrorCachingMinTTL: 0,
        })),
      },
    };
    const same = withSettings(nested, {
      description: "new",
      defaultRootObject: "index.html",
      spa: true,
    });
    expect(same.CustomErrorResponses).toEqual(nested.CustomErrorResponses);

    const moved = withSettings(nested, {
      description: "",
      defaultRootObject: "app.html",
      spa: true,
    });
    expect(errorResponsesOf(moved)[0]).toMatchObject({
      ResponsePagePath: "/app.html",
      ErrorCachingMinTTL: 0,
    });
  });

  it("tells S3 and custom origins apart the same way everywhere", () => {
    const [site, api] = originsOf(fixture);
    expect(originTypeOf(site)).toBe("s3");
    expect(originTypeOf(api)).toBe("custom");
    // Bucket của AWS thật vẫn là origin S3, chỉ không link sang bucket Floci
    expect(
      originTypeOf({
        Id: "x",
        DomainName: "x.example.com",
        S3OriginConfig: { OriginAccessIdentity: "" },
      }),
    ).toBe("s3");
  });

  it("keeps what an origin edit doesn't change", () => {
    const viewer = {
      Id: "api",
      DomainName: "api.example.com",
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "match-viewer" as const,
      },
    };
    const form = {
      type: "custom",
      bucket: "",
      domain: "api.example.com",
      protocol: "http-only",
      port: 80,
      path: "/v2",
      id: "api",
    } as const;
    expect(originFromForm(form, REGION, viewer).CustomOriginConfig?.OriginProtocolPolicy).toBe(
      "match-viewer",
    );
    expect(
      originFromForm({ ...form, protocol: "https-only", port: 8443 }, REGION, viewer)
        .CustomOriginConfig,
    ).toMatchObject({ OriginProtocolPolicy: "https-only", HTTPSPort: 8443, HTTPPort: 80 });

    const global = {
      Id: "site",
      DomainName: "assets.s3.amazonaws.com",
      S3OriginConfig: { OriginAccessIdentity: "" },
    };
    const s3Form = { ...form, type: "s3", bucket: "assets", id: "site" } as const;
    expect(originFromForm(s3Form, REGION, global).DomainName).toBe("assets.s3.amazonaws.com");
    expect(originFromForm({ ...s3Form, bucket: "other" }, REGION, global).DomainName).toBe(
      "other.s3.ap-southeast-1.amazonaws.com",
    );
    expect(originFromForm(s3Form, REGION)).toMatchObject({
      S3OriginConfig: { OriginAccessIdentity: "" },
    });
  });

  it("moves behaviors and names who uses an origin", () => {
    expect(behaviorsOf(moveBehavior(fixture, "/assets/*", -1)).map((b) => b.PathPattern)).toEqual([
      "/assets/*",
      "/api/*",
      "*",
    ]);
    expect(behaviorsUsing(fixture, "api")).toEqual(["/api/*"]);
    expect(behaviorsUsing(fixture, SITE)).toEqual(["Default (*)", "/assets/*"]);
    expect(() => withoutBehavior(fixture, "/gone/*")).toThrow(
      "Behavior /gone/* no longer exists. Refresh the page.",
    );
    expect(() => withOrigin(fixture, { Id: "gone", DomainName: "x" }, { replace: true })).toThrow(
      "Origin gone no longer exists. Refresh the page.",
    );
  });

  it("points the default behavior at another origin", () => {
    const next = withBehavior(fixture, { originalPath: "*", path: "*", originId: "api" });
    expect(next.DefaultCacheBehavior).toMatchObject({
      TargetOriginId: "api",
      CachePolicyId: fixture.DefaultCacheBehavior.CachePolicyId,
    });
  });

  it("creates a distribution config that serves a bucket", () => {
    const config = newDistributionConfig({
      bucket: "b",
      region: REGION,
      defaultRootObject: "index.html",
      spa: true,
      description: "web",
    });
    expect(originsOf(config)[0].Id).toBe("b.s3.ap-southeast-1.amazonaws.com");
    expect(config.DefaultCacheBehavior).toMatchObject({
      TargetOriginId: "b.s3.ap-southeast-1.amazonaws.com",
      CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
      ViewerProtocolPolicy: "allow-all",
    });
    expect(config).toMatchObject({ Enabled: true, Comment: "web" });
    expect(isSpa(config)).toBe(true);
  });

  it("validates origins, behaviors and invalidation paths", () => {
    expect(originSchema(["api"]).safeParse({ ...customForm, id: "api" }).success).toBe(false);
    expect(originSchema([]).safeParse({ ...customForm, domain: "http://x" }).success).toBe(false);
    expect(originSchema([]).safeParse({ ...customForm, path: "/v1/" }).success).toBe(false);
    expect(originSchema([]).safeParse({ ...customForm, path: "/v1" }).success).toBe(true);
    expect(behaviorSchema(["/api/*"]).safeParse({ path: "/api/*", originId: "a" }).success).toBe(
      false,
    );
    expect(behaviorSchema([]).safeParse({ path: "*", originId: "a" }).success).toBe(false);
    expect(
      createDistributionSchema.safeParse({
        bucket: "b",
        defaultRootObject: "/index.html",
        spa: false,
        description: "",
      }).success,
    ).toBe(false);
    expect(invalidationSchema.parse({ paths: " images/*\n\n/index.html " }).paths).toEqual([
      "/images/*",
      "/index.html",
    ]);
    expect(invalidationSchema.safeParse({ paths: "\n " }).success).toBe(false);
  });

  it("finds the distributions that serve a bucket", () => {
    const summary = (id: string, domains: string[]) => ({
      Id: id,
      Origins: {
        Quantity: domains.length,
        Items: domains.map((DomainName) => ({ Id: DomainName, DomainName })),
      },
    });
    const summaries = [
      summary("E1", [SITE]),
      summary("E2", ["my.site.s3.amazonaws.com", "api.example.com"]),
      summary("E3", ["my.site2.s3.ap-southeast-1.amazonaws.com"]),
      { Id: "E4" },
    ];
    expect(distributionsServing(summaries, "my.site").map((item) => item.Id)).toEqual(["E1", "E2"]);
  });

  it("blocks what AWS rejects but Floci accepts", () => {
    // AWS coi /api/* và api/* là một path
    expect(behaviorSchema(["/api/*"]).safeParse({ path: "api/*", originId: "a" }).success).toBe(
      false,
    );
    expect(behaviorSchema(["api/*"]).safeParse({ path: "/api/*", originId: "a" }).success).toBe(
      false,
    );
    expect(originSchema([]).safeParse({ ...customForm, domain: "api example.com" }).success).toBe(
      false,
    );

    const settings = { defaultRootObject: "index.html", spa: false };
    expect(settingsSchema.safeParse({ ...settings, description: "a".repeat(128) }).success).toBe(
      true,
    );
    expect(settingsSchema.safeParse({ ...settings, description: "a".repeat(129) }).success).toBe(
      false,
    );
  });

  it("opens a distribution tab", () => {
    expect(cloudfrontRoutes.distribution("E2ABC", DISTRIBUTION_TABS.general)).toBe(
      "/cloudfront/distributions/E2ABC",
    );
    expect(cloudfrontRoutes.distribution("E2ABC", DISTRIBUTION_TABS.origins)).toBe(
      "/cloudfront/distributions/E2ABC?tab=origins",
    );
    expect(cloudfrontRoutes.createDistribution("my.site")).toBe(
      "/cloudfront/distributions/create?bucket=my.site",
    );
    expect(cloudfrontRoutes.createDistribution()).toBe("/cloudfront/distributions/create");
  });
});
