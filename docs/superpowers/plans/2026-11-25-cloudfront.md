# CloudFront — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dev đặt frontend trên S3 sau một distribution của Floci, mở URL local để thử (root object, SPA, `/api/*` sang origin khác), xem / sửa origin, behavior, bật / tắt / xóa, tạo invalidation; trang bucket biết distribution nào phục vụ nó.

**Architecture:** Service mới `web/src/services/cloudfront/` theo khuôn EC2 / KMS (`routes.ts`, `constants.ts`, `schemas.ts`, hàm thuần trong `distributions.ts`, hooks TanStack Query, trang `lazyPage`), một dòng trong `registry.ts`, nhóm sidebar mới `networking`. Mọi lần sửa đi qua một hook `useUpdateDistribution(change)`: đọc `GetDistributionConfig` ngay lúc lưu → áp hàm thuần → `UpdateDistribution` với ETag vừa đọc. Gọi Floci bằng `@aws-sdk/client-cloudfront` qua proxy `/aws`; không sửa server.

**Tech Stack:** React 19, Cloudscape, react-hook-form + zod (`useZodForm`), TanStack Query v5, `@aws-sdk/client-cloudfront` (mới), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-cloudfront-design.md` (đã duyệt 2026-11-25). Đọc mục 3, 4, 5, 7 trước khi làm.

## Global Constraints

- **Không cài package, không chạy git ghi** (CLAUDE.md). User chạy trước Task 1: `npm install @aws-sdk/client-cloudfront -w web --min-release-age=7` và `npm install @aws-sdk/client-cloudfront -w tests --min-release-age=7`. Bước "Commit" = báo file đã sửa để user tự commit.
- `@aws-sdk/client-cloudfront` không import ở `shared/` hay `registry.ts` (development.md › Traps: bundle). `index.tsx`, `routes.ts`, `constants.ts`, `distributions.ts` chỉ `import type` từ SDK. S3 chỉ import `BucketDistributions` từ trang tải lười.
- Route: `/cloudfront/distributions`, `/cloudfront/distributions/create?bucket=`, `/cloudfront/distributions/:distributionId?tab=` (`general` mặc định không ghi lên URL, `origins`, `behaviors`, `invalidations`). Sidebar nhóm `networking` "Networking & content delivery" màu `#8C4FFF` (như AWS console), mục **Distributions**. Icon Tabler `IconWorldWww`.
- URL local: luôn host `<id viết thường>.cloudfront.localhost`, scheme + port lấy từ `flociPublicUrl` (`useLoadedConfig`); không dựng từ host của `flociPublicUrl`.
- Giá trị cố định: `MANAGED_CACHING_OPTIMIZED_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6"`; `VIEWER_PROTOCOL_POLICY = "allow-all"`; `DEFAULT_ROOT_OBJECT = "index.html"`; `SPA_ERROR_CODES = [403, 404]`, response code `"200"`; origin S3 domain `<bucket>.s3.<region>.amazonaws.com`, `Id` = domain, `S3OriginConfig: { OriginAccessIdentity: "" }`; custom origin `OriginProtocolPolicy` `"http-only"` / `"https-only"`, port mặc định 80 / 443; `CallerReference = crypto.randomUUID()`; invalidation mặc định `/*`.
- Mọi danh sách CloudFront gửi đi phải có `Quantity` bằng số `Items` (Floci không kiểm, AWS kiểm — 7 #11).
- Chữ cố định (tiếng Anh, đúng spec): "Disable the distribution first. CloudFront only deletes disabled distributions." · "The local URL answers 404 until you enable it again." · "AWS name. On Floci, use the local URL." · "Works from your machine (browser, curl, your app). Containers in compose can't resolve this name." · "Serve the default root object with 200 for 403 and 404, so client-side routes load." · "Floci doesn't cache, so cache policies have no effect locally." · "Floci doesn't run CloudFront Functions or Lambda@Edge attached to these behaviors." · "Floci matches behaviors in order, like CloudFront: put specific paths first." · "Floci doesn't cache, so files are always fresh; invalidations complete at once." · "Floci serves it at once at a local URL; there is no deploy wait." · "The distribution changed while saving. Try again." · mô tả Origin domain ở spec 3.4.
- E2E fail khi có `console.error`: không trỏ origin vào bucket đã xóa trong E2E (`HeadBucket` 404).
- Code theo CLAUDE.md: hằng số có tên, comment tiếng Việt ngắn nói lý do, hạn chế type assertion, dòng trống quanh câu lệnh ≥ 3 dòng. Sau khi code: `npm run typecheck`, `npm run lint -w web`, `npx prettier --check`, `/ponytail-review`.

## Review Focus

1. **Cấu hình CDK có field console không hiện** (OAC, `CustomHeaders`, timeout, `FunctionAssociations`, `ForwardedValues`, `Aliases`, `Logging`): mọi hàm `with*` / `without*` / `moveBehavior` phải giữ nguyên → test "keeps fields the console doesn't show" trên fixture (Task 1).
2. **Bucket tên có dấu chấm** (`my.site`) và origin không phải bucket Floci (`s3-website-…`, `example.com`, region khác): `bucketOfOriginDomain` đúng / `undefined` → test (Task 1).
3. **Floci bỏ `Items` khi rỗng** (không có behavior phụ, error page, origin…): mọi hàm đọc / ghi chịu được `Items` thiếu và gửi `Quantity: 0` → test (Task 1).
4. **Đổi Default root object khi SPA đang bật:** hai error response phải trỏ path mới; tắt SPA giữ error response mã khác (500…) → test `withSettings` (Task 1).
5. **Path invalidation dán từ script:** dòng trống, khoảng trắng, thiếu `/` đầu → bỏ / tự thêm, còn ít nhất một path → test `invalidationSchema` (Task 1).

---

## File Structure

```text
web/src/services/cloudfront/
├── index.tsx                  # ServiceDefinition (Task 2)
├── routes.ts                  # route, tab, crumbs (Task 1)
├── constants.ts               # hằng số ở Global Constraints (Task 1)
├── distributions.ts           # hàm thuần (Task 1)
├── schemas.ts                 # form tạo, settings, origin, behavior, invalidation (Task 1)
├── codeSamples.ts             # distributionSample (Task 3)
├── hooks/useCloudFront.ts     # client (Task 2)
├── hooks/useDistributions.ts  # list, detail, create, update, delete (Task 2–4)
├── hooks/useInvalidations.ts  # (Task 7)
├── hooks/usePolicyNames.ts    # (Task 6)
├── pages/                     # DistributionList (2), DistributionDetail (3), CreateDistribution (4)
└── components/                # DistributionStatus, DistributionActions (2); GeneralTab, SettingsModal (3); OriginsTab, OriginModal (5);
                               # BehaviorsTab, BehaviorModal (6); InvalidationsTab, CreateInvalidationModal (7); BucketDistributions (8)
web/src/services/s3/components/BucketLink.tsx  # (Task 5)
web/test/services/cloudfront/cloudfront.test.ts  # unit (Task 1, 3)
tests/it/cloudfront.test.ts, tests/e2e/cloudfront.spec.ts  # (Task 2, 9)
```

---

### Task 1: Hàm thuần, hằng số, schema, routes

**Files:**

- Create: `web/src/services/cloudfront/constants.ts`, `distributions.ts`, `schemas.ts`, `routes.ts`
- Test: `web/test/services/cloudfront/cloudfront.test.ts` (fixture `DistributionConfig` chép từ `GetDistributionConfig` của Floci cho một distribution CDK: origin S3 có `OriginAccessControlId`, custom origin `api` có `CustomHeaders`, behavior phụ theo thứ tự `/api/*` (origin `api`, có `FunctionAssociations`) rồi `/assets/*` (dùng `ForwardedValues`), một error page 500, không có 403 / 404)

**Interfaces:**

- Produces (`constants.ts`): các hằng ở Global Constraints; `ORIGIN_PROTOCOLS = { http: "http-only", https: "https-only" }`; `ORIGIN_PORTS = { "http-only": 80, "https-only": 443 }`; `ORIGIN_TYPES = { s3: "s3", custom: "custom" }`; `DEFAULT_BEHAVIOR_PATH = "*"` (nhãn "Default (\*)"); `DEFAULT_INVALIDATION_PATH = "/*"`; `INVALIDATION_COMPLETED = "Completed"`.
- Produces (`distributions.ts`, mọi hàm trả cấu hình mới, không sửa tham số):
  - `localUrl(flociPublicUrl: string, id: string): string` → `http://<id thường>.cloudfront.localhost:4566/`.
  - `s3OriginDomain(bucket: string, region: string): string`; `bucketOfOriginDomain(domain: string): string | undefined` (khớp `<bucket>.s3.amazonaws.com` và `<bucket>.s3.<region>.amazonaws.com`).
  - `originsOf(config)`, `behaviorsOf(config)` (behavior phụ theo thứ tự, rồi default với `PathPattern` = `DEFAULT_BEHAVIOR_PATH`), `errorResponsesOf(config)` — đều chịu `Items` thiếu.
  - `behaviorsUsing(config, originId: string): string[]` (path của behavior trỏ origin, default là `"Default (*)"`).
  - `isSpa(config): boolean` (có cả 403 và 404 trả `"200"`).
  - `withSettings(config, { description, defaultRootObject, spa })`; `withOrigin(config, origin: Origin)` (thêm, hoặc thay theo `Id`, giữ field cũ không có trong form); `withoutOrigin(config, id)`; `withBehavior(config, { originalPath?: string; path: string; originId: string })` (mới: thêm cuối behavior phụ với `CachePolicyId` / `ViewerProtocolPolicy` mặc định; sửa: đổi path / origin, giữ phần còn lại; `originalPath === "*"` → sửa `DefaultCacheBehavior.TargetOriginId`); `withoutBehavior(config, path)`; `moveBehavior(config, path, offset: -1 | 1)`; `withEnabled(config, enabled: boolean)`. Path / ID không còn → throw `Error("<Origin|Behavior> <x> no longer exists. Refresh the page.")`.
  - `newDistributionConfig({ bucket, region, defaultRootObject, spa, description }): DistributionConfig`.
- Produces (`schemas.ts`): `createDistributionSchema` → `{ bucket, defaultRootObject, spa, description }` (bucket bắt buộc; root object không bắt đầu `/`); `settingsSchema` (cùng luật, SPA cần root object); `originSchema(existingIds: readonly string[])` → `{ type, bucket, domain, protocol, port, path, id }` (custom: domain không chứa `://` hay `/`; path rỗng hoặc bắt đầu `/` và không kết thúc `/`; id không trùng; port 1–65535); `behaviorSchema(existingPaths: readonly string[])` → `{ path, originId }` (không trùng, không là `*`); `invalidationSchema` → `{ paths: string }` parse ra `string[]`.
- Produces (`routes.ts`): `CLOUDFRONT_SERVICE_ID = "cloudfront"`; `CLOUDFRONT_ROUTE_PATTERNS = { distributions: "distributions", createDistribution: "distributions/create", distribution: "distributions/:distributionId" }`; `DISTRIBUTION_TABS = { general, origins, behaviors, invalidations }`; `SEARCH_PARAMS = { tab: "tab", bucket: "bucket" }`; `cloudfrontRoutes = { distributions, createDistribution(bucket?: string), distribution(id: string, tab?: DistributionTab) }`; `cloudfrontBaseCrumbs`, `distributionCrumbs(id)`.

- [ ] **Step 1: Viết test thất bại:**

```ts
it("builds the local URL on the Floci port, never its host", () => {
  expect(localUrl("http://localhost:4566", "E2ABC")).toBe(
    "http://e2abc.cloudfront.localhost:4566/",
  );
  expect(localUrl("http://127.0.0.1:4599", "E2ABC")).toBe(
    "http://e2abc.cloudfront.localhost:4599/",
  );
});
it("finds the Floci bucket of an origin domain", () => {
  expect(bucketOfOriginDomain("my.site.s3.ap-southeast-1.amazonaws.com")).toBe("my.site");
  expect(bucketOfOriginDomain("assets.s3.amazonaws.com")).toBe("assets");
  expect(bucketOfOriginDomain("site.s3-website-ap-southeast-1.amazonaws.com")).toBeUndefined();
  expect(bucketOfOriginDomain("api.example.com")).toBeUndefined();
});
it("keeps fields the console doesn't show", () => {
  const next = withOrigin(fixture, { ...s3Origin, OriginPath: "/v2" });
  expect(originsOf(next)[0].OriginAccessControlId).toBe(
    fixture.Origins.Items[0].OriginAccessControlId,
  );
  expect(
    behaviorsOf(
      withBehavior(fixture, { originalPath: "/api/*", path: "/v1/*", originId: "api" }),
    )[0].FunctionAssociations,
  ).toEqual(fixture.CacheBehaviors.Items[0].FunctionAssociations);
});
it("keeps Quantity equal to Items, also when Floci omits empty Items", () => {
  const bare = newDistributionConfig({
    bucket: "b",
    region: "ap-southeast-1",
    defaultRootObject: "index.html",
    spa: false,
    description: "",
  });
  const withApi = withBehavior(bare, {
    path: "/api/*",
    originId: s3OriginDomain("b", "ap-southeast-1"),
  });
  expect(withApi.CacheBehaviors).toMatchObject({ Quantity: 1 });
  expect(withoutBehavior(withApi, "/api/*").CacheBehaviors).toMatchObject({ Quantity: 0 });
});
it("points SPA error pages at the new root object and keeps other codes", () => {
  const spa = withSettings(fixture, { description: "", defaultRootObject: "app.html", spa: true });
  expect(errorResponsesOf(spa).filter((r) => r.ResponsePagePath === "/app.html")).toHaveLength(2);
  const off = withSettings(spa, { description: "", defaultRootObject: "app.html", spa: false });
  expect(errorResponsesOf(off).map((r) => r.ErrorCode)).toEqual([500]);
  expect(isSpa(spa)).toBe(true);
});
it("moves behaviors and names who uses an origin", () => {
  expect(behaviorsOf(moveBehavior(fixture, "/assets/*", -1)).map((b) => b.PathPattern)).toEqual([
    "/assets/*",
    "/api/*",
    "*",
  ]);
  expect(behaviorsUsing(fixture, "api")).toEqual(["/api/*"]);
  expect(() => withoutBehavior(fixture, "/gone/*")).toThrow(
    "Behavior /gone/* no longer exists. Refresh the page.",
  );
});
it("validates origins, behaviors and invalidation paths", () => {
  expect(originSchema(["api"]).safeParse({ ...customForm, id: "api" }).success).toBe(false);
  expect(originSchema([]).safeParse({ ...customForm, domain: "http://x" }).success).toBe(false);
  expect(originSchema([]).safeParse({ ...customForm, path: "/v1/" }).success).toBe(false);
  expect(behaviorSchema(["/api/*"]).safeParse({ path: "/api/*", originId: "a" }).success).toBe(
    false,
  );
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
it("creates a distribution config that serves a bucket", () => {
  const config = newDistributionConfig({
    bucket: "b",
    region: "ap-southeast-1",
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
  expect(config.Enabled).toBe(true);
  expect(isSpa(config)).toBe(true);
});
it("opens a distribution tab", () => {
  expect(cloudfrontRoutes.distribution("E2ABC", DISTRIBUTION_TABS.general)).toBe(
    "/cloudfront/distributions/E2ABC",
  );
  expect(cloudfrontRoutes.createDistribution("my.site")).toBe(
    "/cloudfront/distributions/create?bucket=my.site",
  );
});
```

- [ ] **Step 2: Chạy, thấy fail:** `npm test -w web -- cloudfront` → FAIL (module không có).
- [ ] **Step 3: Viết 4 file** theo Interfaces. Đọc `Items ?? []` ở mọi chỗ; mỗi lần ghi danh sách tạo `{ Quantity: items.length, Items: items }`. `localUrl` dùng `new URL(flociPublicUrl)` lấy `protocol` + `port`.
- [ ] **Step 4: Chạy lại:** `npm test -w web -- cloudfront` → PASS; `npm run typecheck` → 0 lỗi.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 2: Service, danh sách, trạng thái, Actions (bật / tắt / xóa)

**Files:**

- Create: `web/src/services/cloudfront/index.tsx`, `hooks/useCloudFront.ts`, `hooks/useDistributions.ts`, `components/DistributionStatus.tsx`, `components/DistributionActions.tsx`, `pages/DistributionList.tsx`, `tests/it/cloudfront.test.ts`
- Modify: `web/src/shared/constants.ts:67-75` (`networking: { label: "Networking & content delivery", color: "#8C4FFF" }`); `web/src/registry.ts` (import `cloudfrontService`, đặt ngay sau `rdsService`); `tests/it/leftovers.mjs` (`CloudFrontClient`: distribution có origin `bucketOfOriginDomain` bắt đầu `lc-it-` / `lc-e2e-` → `GetDistributionConfig`, đang bật thì `UpdateDistribution` `Enabled: false`, rồi `DeleteDistribution` với ETag mới; chạy **trước** khi xóa bucket); `tests/ui/responsive.spec.ts` (`{ slug: "cloudfront-distributions", path: "/cloudfront/distributions" }`)

**Interfaces:**

- Consumes: Task 1.
- Produces: `useCloudFront(): CloudFrontClient` (`useAwsClient`); `CLOUDFRONT_QUERY_ROOT = "cloudfront"`, mọi mutation invalidate root; `useDistributions(): UseQueryResult<DistributionSummary[]>` (vòng `NextMarker`); `useDistribution(id): UseQueryResult<{ distribution: Distribution; etag: string } | null>` (`null` khi `NoSuchDistribution` / 404 — `isNotFoundError`); `useUpdateDistribution(id)` mutation nhận `(config: DistributionConfig) => DistributionConfig`, lỗi `InvalidIfMatchVersion` đổi thành `Error("The distribution changed while saving. Try again.")`; `useDeleteDistribution()` (`GetDistributionConfig` lấy ETag → `DeleteDistribution`); `DistributionStatus({ enabled }: { enabled?: boolean })` (Enabled `success`, Disabled `stopped`); `useDistributionActions(target: { id: string; enabled: boolean } | undefined): { menuItems; onMenuItemClick; modal }` (như `useInstanceStateActions` của EC2: Enable chạy ngay, Disable `ConfirmModal` thường, Delete `ConfirmModal` `confirmText={CONFIRM_DELETE}`, khóa khi đang bật với `disabledReason`; xóa từ trang chi tiết thì `navigate(cloudfrontRoutes.distributions)`).

- [ ] **Step 1: Viết IT** `tests/it/cloudfront.test.ts` (client `CloudFrontClient(viaConsole(region))`, bucket `uniqueName("cf")` có `index.html` "home" và `api/ping.txt` ở bucket thứ hai): tạo distribution → `fetch(localUrl)` trả "home"; SPA error responses → `fetch(<url>/deep/link)` 200 "home"; behavior `/api/*` sang bucket thứ hai → `/api/ping.txt` trả nội dung đó; `UpdateDistribution` với ETag cũ reject `InvalidIfMatchVersion`; `CreateInvalidation` `Status = "Completed"`; tắt → URL 404; xóa khi bật reject `DistributionNotDisabled`; tắt rồi xóa OK. URL local dựng như `localUrl` từ `(await consoleConfig()).flociPublicUrl`. `afterAll` dọn distribution + bucket.
- [ ] **Step 2: Chạy:** `npm run test:it -w tests -- cloudfront` → PASS ngay (IT ghi hành vi Floci mà UI dựa vào; fail thì dừng và báo — spec cần sửa).
- [ ] **Step 3: Viết code.** `DistributionList` như `InstanceList` của EC2: `ResponsiveTable` + `useCollection`, cột ID (link chi tiết), Description, Local URL (`Link external`), Origins (domain nối bằng ", "), Status, Last modified (`formatDate`), sắp mặc định Last modified mới nhất; ô tìm "Find distributions by ID, description or origin"; khung hẹp: ID có tầng 2 mô tả + origin; `EmptyState` "No distributions" — "Create a distribution for a bucket, or deploy one with CDK, then refresh." + nút Create distribution; `ActionBar` (refresh, menu `useDistributionActions` dòng đang chọn, nút Create distribution).
- [ ] **Step 4: Kiểm:** typecheck; `docker compose up --build -d console`; `npm run test:ui -w tests -- -g cloudfront` → PASS.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 3: Chi tiết — header, tab General (Details, Connect, Settings, Error pages), StackLink

**Files:**

- Create: `web/src/services/cloudfront/pages/DistributionDetail.tsx`, `components/GeneralTab.tsx`, `components/SettingsModal.tsx`, `codeSamples.ts`
- Modify: `index.tsx` (route chi tiết, `createDistribution` đặt trước), `web/src/services/cloudformation/resourceLinks.ts` (`"AWS::CloudFront::Distribution": (id) => cloudfrontRoutes.distribution(id)`), `web/test/shared/codeSamples.test.ts`

**Interfaces:**

- Consumes: Task 1–2.
- Produces: `distributionSample(id: string): CodeSample` — Node `CreateInvalidationCommand` / Python `create_invalidation` với `DistributionId` điền sẵn, `Paths: { Quantity: 1, Items: ["/*"] }`, `CallerReference` từ thời gian, chú thích "Floci doesn't cache: the invalidation completes at once".

- [ ] **Step 1: Test thất bại** (`codeSamples.test.ts`): `distributionSample("E2ABC").node` chứa `CreateInvalidationCommand`, `"E2ABC"`, `"/*"`; `.python` chứa `create_invalidation`.
- [ ] **Step 2:** `npm test -w web -- codeSamples` → FAIL.
- [ ] **Step 3: Viết code.** `DistributionDetail` theo `InstanceDetail` của EC2: `useParams` `distributionId`, tab từ `?tab=`, `pageState` (`notFound: data === null`, "Distribution … not found", link về danh sách), header ID + mô tả `DistributionStatus` · Comment + `<StackLink separated type='AWS::CloudFront::Distribution' physicalId={id} />`, `ActionBar` (refresh + `useDistributionActions`). `GeneralTab`: `Container` Details (`KeyValuePairs`: ID, ARN, Domain name kèm mô tả, Last modified — `CopyButton`), `Container` Connect (Local URL `CopyButton` + link ngoài, mô tả máy dev, `CodeSamples sample={distributionSample(id)}` như `SettingsTab` của SQS), `Container` Settings (Edit → `SettingsModal`: `FormModal`, `FormInput` Description, Default root object, `FormCheckbox` "Single-page app" khóa khi root object trống; gửi `useUpdateDistribution(id)` với `withSettings`), bảng Error pages chỉ xem (rỗng "No error pages.").
- [ ] **Step 4:** `npm test -w web` PASS; typecheck; mở một distribution trên console thật: sửa Settings bật SPA → deep link trả 200.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 4: Create distribution

**Files:**

- Create: `web/src/services/cloudfront/pages/CreateDistribution.tsx`
- Modify: `hooks/useDistributions.ts` (`useCreateDistribution()`), `index.tsx`, `tests/ui/responsive.spec.ts` (`{ slug: "cloudfront-create", path: "/cloudfront/distributions/create" }`)

**Interfaces:**

- Consumes: `createDistributionSchema`, `newDistributionConfig` (Task 1); `useBuckets` (S3); `useLoadedConfig().region`.
- Produces: `useCreateDistribution()` mutation `(values) => Promise<string /* Id */>`.

- [ ] **Step 1–2:** `newDistributionConfig` và schema đã test ở Task 1; task này không thêm hàm thuần.
- [ ] **Step 3: Viết trang** như `CreateKey` của KMS: `Form` + `Container` "Origin" (`FormSelect` Bucket từ `useBuckets`, điền `?bucket=`; không có bucket: mô tả + link "Create bucket" tới `s3Routes.createBucket`) và "Settings" (Default root object mặc định `index.html`, `FormCheckbox` Single-page app, Description), mô tả header "Floci serves it at once at a local URL; there is no deploy wait.", nút `ResponsiveActions`, chặn bấm đúp bằng ref. Xong `navigate(cloudfrontRoutes.distribution(id))`, flash "Created distribution …".
- [ ] **Step 4:** `npm test -w web` PASS; `npm run test:ui -w tests -- -g cloudfront-create` PASS.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 5: Tab Origins, `OriginModal`, `BucketLink`

**Files:**

- Create: `web/src/services/cloudfront/components/OriginsTab.tsx`, `components/OriginModal.tsx`, `web/src/services/s3/components/BucketLink.tsx`
- Modify: `DistributionDetail.tsx` (tab Origins)

**Interfaces:**

- Consumes: `originsOf`, `withOrigin`, `withoutOrigin`, `behaviorsUsing`, `bucketOfOriginDomain`, `s3OriginDomain`, `originSchema` (Task 1); `useUpdateDistribution` (Task 2).
- Produces: `BucketLink({ name }: { name: string })` — như `QueueLink`: `useBucketExists(name).data === false` → `MissingReference`, không thì `Link` tới `s3Routes.bucket(name)`.

- [ ] **Step 1–2:** logic đã test ở Task 1; không thêm hàm thuần.
- [ ] **Step 3: Viết code.** Bảng Origin ID, Type (S3 khi `bucketOfOriginDomain` có giá trị, không thì Custom), Origin (`BucketLink` hoặc `<protocol>://<domain>:<port>`), Origin path; `ActionBar` Edit / Delete + Create origin; Delete khóa khi `behaviorsUsing` khác rỗng, `disabledReason` "Used by Default (\*) and /api/\*." (nối bằng " and " / ", "). `OriginModal` (`FormModal`): `FormTiles` Origin type (chỉ khi tạo), `FormSelect` Bucket, `FormInput` Origin domain kèm mô tả spec 3.4, `FormRadioGroup` Protocol, `FormInput` Port (đổi protocol thì đổi port mặc định nếu người dùng chưa sửa), Origin path, Origin ID (mặc định domain, sửa thì chỉ hiện). Sửa: dựng `Origin` từ origin đang có + giá trị form rồi `withOrigin`.
- [ ] **Step 4:** typecheck, lint; thử trên console: thêm custom origin `example.com` HTTPS, xóa bị khóa khi có behavior dùng.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 6: Tab Behaviors, `BehaviorModal`, tên policy

**Files:**

- Create: `web/src/services/cloudfront/components/BehaviorsTab.tsx`, `components/BehaviorModal.tsx`, `hooks/usePolicyNames.ts`
- Modify: `DistributionDetail.tsx` (tab Behaviors)

**Interfaces:**

- Consumes: `behaviorsOf`, `withBehavior`, `withoutBehavior`, `moveBehavior`, `behaviorSchema` (Task 1).
- Produces: `usePolicyNames(): { cache: Map<string,string>; originRequest: Map<string,string>; responseHeaders: Map<string,string> }` (`ListCachePolicies`, `ListOriginRequestPolicies`, `ListResponseHeadersPolicies` một lần mỗi loại, cả managed và custom; tên lấy ở `…Policy.…PolicyConfig.Name`).

- [ ] **Step 1: IT** thêm vào `tests/it/cloudfront.test.ts`: `ListCachePolicies` có `Managed-CachingOptimized` với ID `MANAGED_CACHING_OPTIMIZED_ID`; hai loại kia trả tên managed.
- [ ] **Step 2:** `npm run test:it -w tests -- cloudfront` → PASS (ghi hành vi Floci).
- [ ] **Step 3: Viết code.** Mô tả bảng "Floci doesn't cache, so cache policies have no effect locally."; cột Precedence, Path pattern ("Default (\*)" cho default), Origin, Cache policy (ID lạ → ID; `ForwardedValues` → "Legacy cache settings"), Origin request policy, Response headers policy (không có → `NOT_AVAILABLE`); `Alert` info khi có `FunctionAssociations` / `LambdaFunctionAssociations` `Quantity > 0`; Actions Edit, Move up, Move down, Delete (default chỉ Edit; Move khóa ở đầu / cuối danh sách phụ). `BehaviorModal`: mô tả spec 3.5, `FormInput` Path pattern (ẩn với default), `FormSelect` Origin.
- [ ] **Step 4:** typecheck, lint; thử: thêm `/api/*` → URL local `/api/…` đi sang origin mới; Move up đổi thứ tự.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 7: Invalidations

**Files:**

- Create: `web/src/services/cloudfront/hooks/useInvalidations.ts`, `components/InvalidationsTab.tsx`, `components/CreateInvalidationModal.tsx`
- Modify: `DistributionDetail.tsx` (tab Invalidations)

**Interfaces:**

- Consumes: `invalidationSchema`, `DEFAULT_INVALIDATION_PATH`, `INVALIDATION_COMPLETED` (Task 1).
- Produces: `useInvalidations(id)` (vòng `NextMarker`); `useCreateInvalidation(id)` mutation `(paths: string[]) => Promise<string /* Id */>`.

- [ ] **Step 1–2:** schema đã test ở Task 1; IT `Completed` ở Task 2.
- [ ] **Step 3: Viết code.** `Alert` info "Floci doesn't cache, so files are always fresh; invalidations complete at once."; bảng Invalidation ID, Status (`Completed` → `success`, khác → `in-progress`), Created; `ActionBar` refresh + Create invalidation → `FormModal` `FormTextarea` "Paths" mặc định `/*`; flash "Created invalidation …".
- [ ] **Step 4:** typecheck, lint.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 8: Nối S3 — khối "CloudFront distributions" ở trang bucket

**Files:**

- Create: `web/src/services/cloudfront/components/BucketDistributions.tsx`
- Modify: `web/src/services/s3/components/PropertiesTab.tsx:18` (thêm `<BucketDistributions bucket={bucket} />` ngay sau `NotificationsSection`)

**Interfaces:**

- Consumes: `useDistributions` (Task 2), `bucketOfOriginDomain`, `localUrl` (Task 1), `DistributionStatus`.

- [ ] **Step 1:** Test thêm vào `cloudfront.test.ts`: `distributionsServing(summaries, "my.site")` (hàm thuần mới trong `distributions.ts`) chỉ trả distribution có origin `my.site.s3.<region>.amazonaws.com` hoặc `my.site.s3.amazonaws.com`, không trả `my.site2…`.
- [ ] **Step 2:** `npm test -w web -- cloudfront` → FAIL.
- [ ] **Step 3: Viết code.** `Container` Header "CloudFront distributions" có nút "Create distribution" → `cloudfrontRoutes.createDistribution(bucket)`; bảng ID (link), Local URL (link ngoài), Status; rỗng "No distributions serve this bucket.".
- [ ] **Step 4:** `npm test -w web` PASS; `npx playwright test --project=e2e e2e/s3.spec.ts` (từ `tests/`) vẫn PASS.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 9: E2E luồng chính, tài liệu

**Files:**

- Create: `tests/e2e/cloudfront.spec.ts`
- Modify: `README.md` (dòng CloudFront trong bảng Features, sau EC2: emoji 🌐), `docs/development.md` (Traps: URL local chỉ dùng từ máy dev, compose không resolve được (7 #2); Node / Python trên Windows / Linux có thể không resolve `*.localhost` (chưa kiểm); host private cần `FLOCI_SERVICES_CLOUDFRONT_ALLOWED_PRIVATE_ORIGIN_HOSTS`, không có trong compose (7 #6); website endpoint S3 làm custom origin đi ra AWS thật (7 #6); Floci không kiểm cấu hình, console chặn (7 #11)), `docs/superpowers/specs/2026-11-25-cloudfront-design.md` (Trạng thái: đã làm), `docs/superpowers/roadmap.md` (CloudFront: Đã làm)

- [ ] **Step 1: Viết E2E** (`mode: "serial"`, tên `uniqueName("cf")`): tạo bucket + `index.html` bằng SDK → trang bucket › Properties › khối CloudFront › Create distribution (bucket điền sẵn), bật Single-page app → chi tiết: flash, Local URL; `page.request.get(localUrl + "deep/link")` → 200 chứa nội dung `index.html` → tab Origins: Create origin S3 bucket thứ hai → tab Behaviors: Create behavior `/api/*` → origin đó, `page.request` `/api/ping.txt` đúng nội dung → tab Invalidations: Create invalidation → Completed → Actions › Disable (xác nhận) → Disabled, Delete hết khóa → Delete (gõ `delete`) → về danh sách. Trang bucket hiện lại "No distributions serve this bucket.". `afterAll` dọn bucket (và distribution nếu còn).
- [ ] **Step 2:** `npx playwright test --project=e2e e2e/cloudfront.spec.ts` → PASS.
- [ ] **Step 3:** Chạy đủ: `npm test`, `npm run test:it -w tests`, `npm run test:e2e -w tests`, `npm run test:ui -w tests` → PASS (trang chi tiết cần ID nên không vào `responsive.spec.ts`, chỉ chụp tay); chụp tay 1440 / 1024 / 390 / 320 light / dark trang danh sách, chi tiết (4 tab), Create: không cuộn ngang. Chạy E2E với `caffeinate -i`.
- [ ] **Step 4:** Sửa tài liệu theo Files; `npx prettier --check .`.
- [ ] **Step 5:** `/ponytail-review` trên toàn bộ diff; báo file cho user commit.
