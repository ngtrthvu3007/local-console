# CloudFront — Thiết kế

> Ngày: 2026-11-25 · Trạng thái: đã làm · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4

## 1. Mục tiêu

Màn hình CloudFront cho dev local, theo roadmap: **xem distribution, origin; lấy URL CDN local cho frontend đặt trên S3**. Floci 2.4.0 phục vụ file thật qua distribution (mục 7), chỉ không cache.

Dev dùng để:

- Đặt frontend (SPA, site tĩnh) trên S3 sau một distribution, mở URL local để thử như trên AWS: default root object, routing của SPA (403 / 404 → `/index.html`), path `/api/*` sang origin khác.
- Xem distribution CDK tạo: origin, behavior, error page, stack nào tạo.
- Bật / tắt, xóa distribution; tạo invalidation như script deploy làm.
- Từ trang bucket biết bucket đang được distribution nào phục vụ, và ngược lại.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng, **hoặc** (2) nối với service khác, **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Chỗ "(đoán)" là phỏng đoán về mức dev dùng.

### Làm trong đợt này

| Nhóm             | Tính năng                                                                                                            | Tiêu chí | Floci 2.4.0                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Danh sách        | Distribution: ID, mô tả, URL local, origin, trạng thái, sửa lần cuối                                                 | (1)      | Toàn phần                                                                                                                              |
| Chi tiết         | ID / ARN, domain name, **URL local** (copy, mở), bật / tắt, mô tả, default root object, error page, origin, behavior | (1)      | Một phần: Floci chỉ trả `*.cloudfront.net`, console tự dựng URL local (7 #2); `Status` luôn `Deployed` (7 #1)                          |
| Tạo distribution | Origin là bucket S3 (chọn từ danh sách), default root object, SPA (403 / 404 → root object, 200), mô tả              | (1)      | Toàn phần; Floci nhận `CallerReference` trùng (console tự sinh, 7 #11)                                                                 |
| Origin           | Thêm / sửa / xóa origin S3 và custom (HTTP / HTTPS), origin path                                                     | (1) (2)  | Một phần: không kiểm ID trùng, xóa origin đang dùng (console chặn, 7 #11); host private cần cấu hình Floci (7 #6); không áp OAC (7 #8) |
| Behavior         | Thêm / sửa / xóa path pattern → origin, đổi thứ tự; xem tên cache / origin request / response headers policy         | (1)      | Một phần: không kiểm origin đích, path trùng (console chặn, 7 #11); không cache; không áp `ViewerProtocolPolicy` (7 #8)                |
| Error page       | Xem `CustomErrorResponses`; bật / tắt SPA ở Settings                                                                 | (1)      | Toàn phần                                                                                                                              |
| Trạng thái       | Bật / tắt; xóa (phải tắt trước, như AWS)                                                                             | (1)      | Toàn phần                                                                                                                              |
| Invalidation     | Tạo (danh sách path), xem danh sách                                                                                  | (1)      | Toàn phần (user chốt): trả `Completed` ngay; vì Floci không cache nên không có gì để xóa (7 #4)                                        |
| StackLink        | `AWS::CloudFront::Distribution` → trang distribution; "Stack: X" trên trang distribution                             | (2)      | Toàn phần (7 #9)                                                                                                                       |
| Nối S3           | Trang bucket liệt kê distribution phục vụ bucket; origin S3 link sang bucket; nút tạo distribution cho bucket        | (2)      | Toàn phần: `ListDistributions` có origin (7 #10)                                                                                       |
| Connect card     | URL local + code `CreateInvalidation` (Node.js, Python) điền sẵn ID                                                  | (1)      | Toàn phần                                                                                                                              |

### Để sau

| Tính năng                                                                   | Lý do                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xem path của invalidation cũ                                                | `ListInvalidations` không trả path; phải gọi `GetInvalidation` từng dòng (trái nguyên tắc). Floci không cache nên invalidation cũ ít đáng xem (đoán)                      |
| Chọn policy có sẵn (cache / origin request / response headers) cho behavior | User chốt chỉ hiện tên. Response headers policy có áp thật (CORS, 7 #8) nhưng frontend gọi API cùng distribution (`/api/*`) không cần CORS: để sau (user chốt 2026-11-25) |
| Origin group (failover)                                                     | (đoán) ít thử ở local; chưa kiểm Floci                                                                                                                                    |
| Signed URL / cookie (trusted key group)                                     | Chưa kiểm Floci có kiểm chữ ký không                                                                                                                                      |
| Cảnh báo khi xóa bucket đang được distribution dùng                         | Origin đã hiện "(not found)" sau khi xóa (`BucketLink`); cảnh báo trước cần quét distribution trong modal xóa của S3                                                      |

### Không làm

| Tính năng                                                                   | Lý do                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CloudFront Functions, Lambda@Edge                                           | Floci nhận cấu hình nhưng không chạy (7 #7): UI sẽ là giả (user chốt) |
| Tạo / sửa OAC, cache policy, response headers policy, origin request policy | User chốt: chỉ hiện tên policy                                        |
| Logging, WAF, ACM certificate / alternate domain name                       | User chốt                                                             |
| Price class, HTTP version, IPv6, geo restriction, field-level encryption    | Không có tác dụng ở local                                             |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: nhóm mới **Networking & content delivery** (như AWS), mục **Distributions**. Invalidation nằm trong trang distribution (như AWS).

### 3.1 Distributions — `/cloudfront/distributions`

```text
Distributions (3)                                          [↻] [Actions ▾] [Create distribution]
[🔍 Find distributions by ID, description or origin              ]
 ◯ ID               Description   Local URL                                   Origins                                     Status       Last modified
 ◯ E2ABCDEF123456   web app       http://e2abcdef123456.cloudfront.localhost… ↗ my-site.s3.ap-southeast-1.amazonaws.com     ● Enabled    2026-11-25 10:02
 ◯ E9XYZ0000AAAAA   —             http://e9xyz0000aaaaa.cloudfront.localhost… ↗ assets.s3…, api.example.com                 ○ Disabled   2026-11-24 18:40
```

- `ListDistributions` (vòng `NextMarker`). Một lần gọi, không gọi thêm từng dòng: summary của Floci có `Comment`, `Enabled`, origin, `LastModifiedTime` (7 #10). Ô tìm lọc ở client theo ID, mô tả, domain của origin. Mặc định sắp theo Last modified mới nhất.
- **Local URL** là link ngoài (mở tab mới), dựng bằng `localUrl` (mục 4). **Origins** là domain các origin, nối bằng dấu phẩy.
- **Status** là `DistributionStatus` (như `DatabaseStatus`): `Enabled` → "Enabled" `success`, không thì "Disabled" `stopped`. `Status` của Floci luôn `Deployed` nên không hiện (7 #1).
- **Actions** (menu chung của `ActionBar`, chọn một dòng): Enable, Disable, Delete (`DistributionActions`, dùng chung cho trang chi tiết như `useInstanceStateActions` của EC2). Delete khóa khi đang bật, `disabledReason`: "Disable the distribution first. CloudFront only deletes disabled distributions." Disable là `ConfirmModal` thường: "The local URL answers 404 until you enable it again." Delete là `ConfirmModal` gõ `delete`.
- Khung hẹp: cột ID có tầng 2 là mô tả và origin (xám), cạnh cột Status; như `InstanceList`.
- Rỗng: `EmptyState` "No distributions" — "Create a distribution for a bucket, or deploy one with CDK, then refresh." kèm nút Create distribution.

### 3.2 Chi tiết distribution — `/cloudfront/distributions/:id`

```text
E2ABCDEF123456                                             [↻] [Actions ▾]
● Enabled · web app · Stack: WebStack ↗
[General] [Origins] [Behaviors] [Invalidations]
```

- Một lần `GetDistribution` (cấu hình đầy đủ + ETag). Tab lưu trên URL (`?tab=`), mặc định General không ghi lên URL (như EC2).
- Không có: "Distribution … not found" kèm link về danh sách (`pageState`).

**General**, bốn `Container`:

```text
Details
  Distribution ID  E2ABCDEF123456 ⧉        ARN  arn:aws:cloudfront::000000000000:distribution/E2… ⧉
  Domain name      e2abcdef123456.cloudfront.net ⧉     Last modified  2026-11-25 10:02
Connect                                     URL for your app, on your machine.
  Local URL        http://e2abcdef123456.cloudfront.localhost:4566/ ⧉ ↗
  [Node.js] [Python]   CreateInvalidation …                                          ⧉
Settings                                                                 [Edit]
  Description  web app      Default root object  index.html      Single-page app  On
Error pages (2)
  HTTP error code   Response page path   Response code
  403               /index.html          200
  404               /index.html          200
```

- Domain name có mô tả "AWS name. On Floci, use the local URL." Local URL là `CopyButton` + link ngoài; mô tả Connect thêm: "Works from your machine (browser, curl, your app). Containers in compose can't resolve this name." (7 #2).
- Code mẫu (`codeSamples.ts`): `CreateInvalidation` với `Paths ["/*"]` và ID điền sẵn, như bước cuối script deploy; chú thích "Floci doesn't cache: the invalidation completes at once". Dùng `CodeSamples` trong khối Connect như tab Settings của SQS.
- **Settings › Edit** (`FormModal`): Description, Default root object, checkbox "Single-page app" ("Serve the default root object with 200 for 403 and 404, so client-side routes load."). Checkbox bật khi có đủ hai error response 403 và 404 trả 200; bật thì thêm / ghi đè hai mục đó với `ResponsePagePath` `/<default root object>`; tắt thì bỏ hai mục đó, giữ mã khác. Khóa checkbox khi Default root object trống.
- **Error pages** chỉ xem (`CustomErrorResponses`); rỗng: "No error pages."

**Origins:**

```text
Origins (2)                                       [Actions ▾] [Create origin]
 ◯ Origin ID                                   Type     Origin                              Origin path
 ◯ my-site.s3.ap-southeast-1.amazonaws.com      S3       my-site                             —
 ◯ api                                         Custom   http://host.docker.internal:3000    /v1
```

- Origin S3: cột Origin là `BucketLink` (link sang bucket, dò bằng `useBucketExists`, không có → `MissingReference` "(not found)"). Custom: `<protocol>://<domain>:<port>`.
- Actions: Edit, Delete. Delete khóa khi origin đang được behavior dùng, `disabledReason` liệt kê: "Used by Default (_) and /api/_." (Floci cho xóa và distribution trả 502 "No origin matched the request.", 7 #11).

**Behaviors:**

```text
Behaviors (3)                                     [Actions ▾] [Create behavior]
Floci doesn't cache, so cache policies have no effect locally.
 ◯ Precedence  Path pattern  Origin    Cache policy               Origin request policy   Response headers policy
 ◯ 0           /api/*        api       Managed-CachingDisabled    Managed-AllViewer       —
 ◯ 1           /assets/*     my-site…  Managed-CachingOptimized   —                       —
 ◯ 2           Default (*)   my-site…  Managed-CachingOptimized   —                       Managed-SimpleCORS
```

- Tên policy: `ListCachePolicies`, `ListOriginRequestPolicies`, `ListResponseHeadersPolicies` mỗi loại một lần (cả managed và custom), tra theo ID. ID không có trong danh sách → hiện ID. Behavior dùng `ForwardedValues` (cấu hình cũ, CDK / CloudFormation còn dùng) → "Legacy cache settings".
- Actions: Edit, Move up, Move down, Delete. Default (*) chỉ có Edit (đổi origin), luôn đứng cuối. Floci khớp behavior theo thứ tự như AWS (7 #12), nên cần đổi thứ tự.
- Có behavior gắn CloudFront Function hoặc Lambda@Edge (thường do CDK) → `Alert` info đầu tab: "Floci doesn't run CloudFront Functions or Lambda@Edge attached to these behaviors." Đọc thẳng `FunctionAssociations` / `LambdaFunctionAssociations` trong cấu hình.

**Invalidations:** 3.6.

**Actions** của header: như 3.1.

### 3.3 Create distribution — `/cloudfront/distributions/create?bucket=<tên>`

| Trường              | Ghi chú                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Bucket              | `FormSelect` từ `useBuckets` của S3. Bắt buộc. `?bucket=` (từ trang bucket) điền sẵn. Không có bucket: mô tả + link "Create bucket" |
| Default root object | Mặc định `index.html`. Không bắt đầu bằng `/` (Floci nhận, AWS không — 7 #11)                                                       |
| Single-page app     | `FormCheckbox`, mặc định tắt. Như checkbox ở Settings (3.2)                                                                         |
| Description         | Tùy chọn (`Comment`)                                                                                                                |

- Trang form như Create key của KMS: `Form` + `Container` "Origin" và "Settings" (Header h2), nút ở `ResponsiveActions`.
- Gửi: origin S3 domain `<bucket>.s3.<region>.amazonaws.com` (region của console, như `RegionalDomainName` CDK dùng — 7 #9), `Id` = domain đó (như AWS console), behavior mặc định trỏ vào origin, `CachePolicyId` Managed-CachingOptimized, `ViewerProtocolPolicy` `allow-all`, `Enabled` true, `CallerReference` sinh mới mỗi lần.
- Tạo xong mở chi tiết, flash "Created distribution E2…". Mô tả dưới header trang: "Floci serves it at once at a local URL; there is no deploy wait."
- Custom origin không có ở form tạo: thêm ở tab Origins sau khi tạo.

### 3.4 Modal origin (Create origin / Edit origin)

| Trường        | Ghi chú                                                                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin type   | `FormTiles`: "S3 bucket" · "Custom origin". Chỉ khi tạo; sửa thì chỉ hiện                                                                                                                                                                                                               |
| Bucket        | S3: `FormSelect` như 3.3                                                                                                                                                                                                                                                                |
| Origin domain | Custom: chỉ tên host (chặn `://` và `/`). Mô tả: "An app on your machine: use host.docker.internal, and start Floci with FLOCI_SERVICES_CLOUDFRONT_ALLOWED_PRIVATE_ORIGIN_HOSTS=host.docker.internal. For buckets in Floci, choose S3 bucket: a custom origin is fetched as is." (7 #6) |
| Protocol      | Custom: `FormRadioGroup` "HTTP only" / "HTTPS only", mặc định HTTP only                                                                                                                                                                                                                 |
| Port          | Custom: mặc định 80 / 443 theo protocol                                                                                                                                                                                                                                                 |
| Origin path   | Tùy chọn; bắt đầu bằng `/`, không kết thúc bằng `/` (luật AWS)                                                                                                                                                                                                                          |
| Origin ID     | Mặc định là domain; không trùng origin khác. Sửa thì chỉ hiện (behavior tham chiếu theo ID)                                                                                                                                                                                             |

- Sửa origin giữ nguyên các field console không hiện (OAC, timeout, custom header) vì sửa trên cấu hình đọc lại (mục 4).

### 3.5 Modal behavior (Create behavior / Edit behavior)

| Trường       | Ghi chú                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| Path pattern | Bắt buộc, không trùng behavior khác, không là `*`. Default (*): không có trường này |
| Origin       | `FormSelect` các origin của distribution (theo ID)                                  |

- Mô tả modal: "Floci matches behaviors in order, like CloudFront: put specific paths first." Behavior mới thêm cuối danh sách (trước Default).
- Behavior mới: `CachePolicyId` Managed-CachingOptimized, `ViewerProtocolPolicy` `allow-all` (như mặc định của AWS console / CDK). Sửa chỉ đổi path và origin, giữ nguyên policy, function association.

### 3.6 Invalidations

```text
Invalidations (2)                                    [↻] [Create invalidation]
ⓘ Floci doesn't cache, so files are always fresh; invalidations complete at once.
 Invalidation ID     Status        Created
 I2X9…               ● Completed   2026-11-25 10:05
```

- `ListInvalidations` (vòng `NextMarker`). Status `Completed` → `success`, khác → `in-progress`.
- **Create invalidation** (`FormModal`): `FormTextarea` "Paths", mỗi dòng một path, mặc định `/*`. Bỏ dòng trống; thiếu `/` đầu thì tự thêm (Floci nhận path không có `/`, AWS từ chối — 7 #4); ít nhất một path. `CallerReference` sinh mới. Xong: flash "Created invalidation I2X9…".

### 3.7 Nối S3

- **Trang bucket › Properties:** `Container` "CloudFront distributions" sau khối Event notifications. `ListDistributions` một lần, lọc distribution có origin trỏ vào bucket (`bucketOfOriginDomain`, mục 4). Cột: ID (link 3.2), Local URL (link ngoài), Status. Header có nút "Create distribution" → 3.3 với `?bucket=`. Rỗng: "No distributions serve this bucket."
- **Distribution → bucket:** `BucketLink` ở tab Origins (3.2). Component mới `services/s3/components/BucketLink.tsx`, như `QueueLink`.

### 3.8 CloudFormation

- `StackLink type='AWS::CloudFront::Distribution' physicalId={id}` trong mô tả header 3.2 (physical ID = distribution ID, 7 #9).
- Thêm `"AWS::CloudFront::Distribution": (id) => cloudfrontRoutes.distribution(id)` vào `resourceLinks.ts`.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                                            | Gọi                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Danh sách, khối của S3                              | `ListDistributions`                                                                 |
| Chi tiết                                            | `GetDistribution` (cấu hình + ETag); tab Behaviors thêm ba `List*Policies`          |
| Tạo                                                 | `CreateDistribution`                                                                |
| Sửa (settings, origin, behavior, thứ tự, bật / tắt) | `GetDistributionConfig` → áp thay đổi → `UpdateDistribution(IfMatch: ETag vừa đọc)` |
| Xóa                                                 | `GetDistributionConfig` (ETag mới) → `DeleteDistribution(IfMatch)`                  |
| Invalidation                                        | `ListInvalidations`, `CreateInvalidation`                                           |
| `BucketLink`                                        | `HeadBucket` (`useBucketExists` có sẵn)                                             |

**Sửa cấu hình.** CloudFront bắt gửi lại **toàn bộ** cấu hình kèm ETag. Mỗi lần lưu, hook `useUpdateDistribution` đọc `GetDistributionConfig` ngay lúc đó, áp một hàm thuần (`distributions.ts`: `withSettings`, `withOrigin`, `withoutOrigin`, `withBehavior`, `withoutBehavior`, `moveBehavior`, `withEnabled`) rồi gửi `UpdateDistribution` với ETag vừa đọc. Hàm thuần tìm origin theo ID, behavior theo path, nên thay đổi người khác vừa làm (CDK deploy lại, app gọi API) ở phần khác được giữ. Floci từ chối ETag cũ (`InvalidIfMatchVersion`, 7 #5) nên hai lần lưu chen nhau không ghi đè lẫn nhau. Origin / behavior đang sửa đã bị xóa ở cấu hình mới → lỗi "… no longer exists. Refresh the page." Không lưu nháp: modal điền từ dữ liệu trang đang có.

**URL local.** `localUrl(flociPublicUrl, id)`: luôn là host `<id viết thường>.cloudfront.localhost`, chỉ lấy port của `flociPublicUrl` (`useLoadedConfig`) → `http://e2abcdef123456.cloudfront.localhost:4566/`. Không dựng từ host của `flociPublicUrl`: đặt `http://127.0.0.1:4566` sẽ ra `….cloudfront.127.0.0.1` hỏng. Floci nhận cả `*.cloudfront.localhost` và `*.cloudfront.localhost.floci.io` (7 #2).

**Bucket của origin.** `bucketOfOriginDomain(domain)`: khớp `<bucket>.s3.amazonaws.com` và `<bucket>.s3.<region>.amazonaws.com` (hai dạng Floci phục vụ từ S3 của nó, 7 #3). Domain khác (kể cả website endpoint `s3-website-…`) không phải bucket của Floci.

---

## 5. Trạng thái và lỗi

| Tình huống                                           | Hiển thị                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Distribution không có                                | "Distribution … not found" kèm link về danh sách                                       |
| Lưu khi cấu hình vừa đổi (`InvalidIfMatchVersion`)   | Lỗi "The distribution changed while saving. Try again." (lần lưu sau tự đọc lại)       |
| Xóa distribution đang bật                            | Menu khóa với lý do (3.1); Floci trả 409 `DistributionNotDisabled` nếu gọi từ chỗ khác |
| Xóa origin đang được behavior dùng                   | Menu khóa với lý do (3.2)                                                              |
| Origin ID trùng, path pattern trùng, origin path sai | Form chặn (Floci nhận, 7 #11)                                                          |
| Bucket của origin S3 đã xóa                          | `BucketLink` "(not found)"; URL local trả 404 "The specified bucket does not exist."   |
| Custom origin là host private chưa cho phép          | Mô tả trong modal origin (3.4); URL local trả 502, lý do chỉ nằm trong log Floci       |
| Distribution tắt                                     | Status Disabled; mô tả trong modal Disable (URL local trả 404)                         |
| Behavior gắn Function / Lambda@Edge                  | `Alert` info ở tab Behaviors                                                           |
| Chưa có bucket khi tạo distribution                  | Mô tả dưới ô Bucket + link "Create bucket"                                             |
| Invalidation                                         | `Alert` info ở tab Invalidations                                                       |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-cloudfront -w web --min-release-age=7
npm install @aws-sdk/client-cloudfront -w tests --min-release-age=7
```

`-w tests` cho `tests/it/cloudfront.test.ts` và `tests/it/leftovers.mjs`. `@aws-sdk/client-cloudfront` chỉ import trong service CloudFront và trong trang tải lười của S3 (qua khối 3.7), không import ở `shared/` hay `registry.ts` (development.md › Traps: bundle).

### Cấu trúc thư mục

```bash
web/src/services/cloudfront/
├── index.tsx, routes.ts, constants.ts   # MANAGED_CACHING_OPTIMIZED_ID, SPA_ERROR_CODES [403, 404], DEFAULT_ROOT_OBJECT, VIEWER_PROTOCOL_POLICY
├── distributions.ts           # localUrl, bucketOfOriginDomain, s3OriginDomain, behavior dùng origin, with* / without* / moveBehavior, trạng thái SPA
├── schemas.ts                 # form tạo, origin, behavior, settings, invalidation
├── codeSamples.ts             # Connect card: CreateInvalidation
├── hooks/                     # useCloudFront (client), useDistributions (list, detail, create, update, delete), useInvalidations, usePolicyNames
├── pages/                     # DistributionList, DistributionDetail, CreateDistribution
└── components/                # DistributionStatus, DistributionActions, GeneralTab, SettingsModal, OriginsTab, OriginModal,
                               # BehaviorsTab, BehaviorModal, InvalidationsTab, CreateInvalidationModal, BucketDistributions (khối 3.7)
web/src/services/s3/components/BucketLink.tsx
```

- Một dòng trong `registry.ts`, `category: "networking"`; icon glyph Tabler (vd `IconWorldWww`).
- Thêm nhóm `networking: { label: "Networking & content delivery", … }` vào `SERVICE_CATEGORIES` (`shared/constants.ts`), màu như AWS console.
- Dòng `AWS::CloudFront::Distribution` trong `resourceLinks.ts`.
- `PropertiesTab` của S3 thêm `<BucketDistributions bucket={bucket} />`.

### Dùng lại

| Thành phần                                                                                           | Dùng cho                                    |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `CopyButton`, `useZodForm`, `FormFields`  | Bảng, actions, form, modal                  |
| `FormTiles` (Origin type), `FormRadioGroup` (Protocol), `FormSelect`, `FormCheckbox`, `FormTextarea` | Form                                        |
| `ResponsiveTable`, `EmptyState`, `emptyOrError`, `useIsCompact`, `selectionLabels`                   | Danh sách, bảng trong tab                   |
| `pageState`, `StackLink`, `useNotify` / `notifyOutcome`, `formatDate`, `useLoadedConfig`             | Trang chi tiết, thông báo, URL local        |
| `CodeSamples`, `shared/codeSamples.ts` (`lines`, `literal`, `NODE_AWS_NOTE`)                         | Connect card                                |
| `useBuckets`, `useBucketExists` (S3), `MissingReference`, mẫu `QueueLink`                            | Chọn bucket, `BucketLink`                   |
| Mẫu `useInstanceStateActions` (EC2), `DatabaseStatus` (RDS)                                          | `DistributionActions`, `DistributionStatus` |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-25 qua proxy `/aws` (REST-XML `/2020-05-31/…`, ký SigV4 `cloudfront`). Mục 1–10: kiểm trước đó cùng ngày; phần **đã kiểm lại / thêm** là lần chạy khi viết spec. Distribution, bucket, stack tạm (`lc-e2e-*`) đã xóa; #6 thêm chạy trên một Floci tạm (`docker run --rm`, cổng 4599) đã dừng.

| #   | Rủi ro                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tạo distribution**             | **Ổn.** Origin S3 `<bucket>.s3.<region>.amazonaws.com`, `DefaultRootObject`, cache policy managed `658327ea-…`: `Status` `Deployed` ngay; `DomainName` `<id>.cloudfront.net`, ARN `arn:aws:cloudfront::000000000000:distribution/<ID>`. Đã kiểm lại: `Status` vẫn `Deployed` sau update và sau khi tắt                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | **URL local**                    | Phục vụ thật ở `http://<id>.cloudfront.localhost.floci.io:4566/` và `http://<id>.cloudfront.localhost:4566/` (ID hoa cũng được). Floci chỉ trả `*.cloudfront.net` (`floci.services.cloudfront.domain-suffix`, mặc định `cloudfront.net`, chỉ đổi tên trả về — đọc từ cấu hình trong binary, không đổi thử). **Thêm:** trên macOS `*.localhost` resolve ra `127.0.0.1` với trình duyệt, Node, Python (không cần DNS). **Từ container trong compose: không dùng được** — `<id>.cloudfront.localhost.floci.io` resolve `127.0.0.1` (alias compose chỉ cho đúng `localhost.floci.io`) → `ECONNREFUSED`; gửi tới `http://localhost.floci.io:4566` kèm header `Host: <id>.cloudfront.localhost.floci.io` thì 200 |
| 3   | **Phục vụ file**                 | Default root object; origin S3 thứ hai qua behavior `/api/*`; `CustomErrorResponses` 403 / 404 → `/index.html` 200 (SPA). **Thêm:** origin domain toàn cục `<bucket>.s3.amazonaws.com` và `OriginPath` chạy; path gửi sang origin giữ nguyên tiền tố của pattern (như AWS). Key không có → 404 "The specified key does not exist." (AWS thường 403) — SPA bắt cả hai                                                                                                                                                                                                                                                                                                                                       |
| 4   | **Cache, invalidation**          | Không cache: sửa object S3 thấy ngay. `CreateInvalidation` / `ListInvalidations` chạy, `Completed` ngay → user chốt API hỗ trợ đủ. **Thêm:** summary của `ListInvalidations` không có path (`GetInvalidation` có). Floci nhận path thiếu `/`, danh sách rỗng, `CallerReference` trùng                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | **Tắt, xóa, ETag**               | Tắt → URL 404. Xóa khi đang bật → 409 `DistributionNotDisabled`. `If-Match` sai → 400 `InvalidIfMatchVersion`. **Thêm:** `UpdateDistribution` thiếu `If-Match` hoặc với ETag cũ (đã bị lần lưu khác thay) → 400 `InvalidIfMatchVersion`; ETag trả về sau update dùng được ngay cho `DeleteDistribution`                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | **Custom origin**                | Host public (example.com) và chính Floci chạy; `host.docker.internal` → 502, log Floci: host private, phải liệt kê ở `floci.services.cloudfront.allowed-private-origin-hosts`. User chốt: **không thêm vào compose**, chỉ ghi Trap. **Thêm:** Floci tạm với `FLOCI_SERVICES_CLOUDFRONT_ALLOWED_PRIVATE_ORIGIN_HOSTS=host.docker.internal` phục vụ được app trên máy dev (200). HTTPS only (example.com:443) chạy. **Website endpoint `<bucket>.s3-website-<region>.amazonaws.com` làm custom origin bị gọi ra AWS thật** (trả `NoSuchBucket` của AWS), không phải S3 của Floci                                                                                                                             |
| 7   | **Functions, Lambda@Edge**       | CloudFront Functions: Create / Publish / List chạy, `TestFunction` → 404; function gắn vào behavior **không chạy**. Lambda@Edge: nhận cấu hình, **không chạy** → Không làm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | **Policy, OAC, viewer protocol** | Tạo OAC chạy (không áp). `ListCachePolicies` trả tên managed (Managed-CachingOptimized, Managed-CachingDisabled, …). **Thêm:** `ListOriginRequestPolicies`, `ListResponseHeadersPolicies` trả tên managed; custom rỗng; `GetCachePolicy` ID lạ → 404 `NoSuchCachePolicy`. **Response headers policy có áp:** Managed-SimpleCORS thêm `Access-Control-Allow-Origin: *`. `ViewerProtocolPolicy` `redirect-to-https` không áp (HTTP vẫn 200)                                                                                                                                                                                                                                                                  |
| 9   | **CloudFormation**               | `AWS::CloudFront::Distribution` tạo thật (physical ID = distribution ID), có trong `ListDistributions`. **Thêm:** `GetAtt RegionalDomainName` của bucket = `<bucket>.s3.<region>.amazonaws.com`; distribution kèm `AWS::CloudFront::OriginAccessControl` phục vụ được; `DeleteStack` xóa luôn distribution đang bật                                                                                                                                                                                                                                                                                                                                                                                        |
| 10  | **Danh sách**                    | Summary có domain các origin và `Comment` → trang bucket hiện distribution phục vụ nó bằng một lần gọi. **Thêm:** summary của Floci **không có** `DefaultCacheBehavior`, `CacheBehaviors`, `CustomErrorResponses` (AWS có) → danh sách không dựa vào chúng. `MaxItems` + `NextMarker` chạy; `Quantity` là tổng chứ không phải số trên trang (SDK đọc `Items`)                                                                                                                                                                                                                                                                                                                                              |
| 11  | **Floci không kiểm cấu hình**    | **Thêm:** nhận origin ID trùng, behavior (kể cả mặc định) trỏ origin không có, path pattern trùng, `Quantity` sai, `DefaultRootObject` bắt đầu `/`, xóa origin đang được behavior dùng; trỏ origin không có → URL trả 502 "No origin matched the request.". `CallerReference` trùng tạo distribution thứ hai (AWS: `DistributionAlreadyExists`)                                                                                                                                                                                                                                                                                                                                                            |
| 12  | **Thứ tự behavior**              | **Thêm:** khớp theo thứ tự trong danh sách: `/a/*` đứng trước `/a/b/*` thì `/a/b/c.txt` đi theo `/a/*` (như precedence của AWS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13  | **Region**                       | **Thêm:** dữ liệu toàn cục: ký bằng `us-east-1` hay `ap-southeast-1` (region console, SDK dùng khi đặt endpoint) đều thấy cùng danh sách                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Chưa kiểm:** Lambda container (dùng DNS của Floci) có mở được URL local không; Node / Python trên Windows và Linux có resolve `*.localhost` không (trình duyệt thì có trên mọi hệ điều hành; script deploy gọi URL local có thể lỗi); origin group; signed URL; path pattern có `?`.

---

## 8. Thứ tự làm

1. User cài package (mục 6). Nhóm `networking` trong `SERVICE_CATEGORIES`, `registry.ts`, `useCloudFront`, routes.
2. Hàm thuần + unit test: `distributions.ts` (`localUrl`, `bucketOfOriginDomain`, with* / without* / `moveBehavior` trên fixture cấu hình thật của Floci, trạng thái SPA, origin đang được dùng), schema form (origin ID / path trùng, origin path, path invalidation thêm `/`).
3. Danh sách, `DistributionStatus`, `DistributionActions` (bật / tắt / xóa).
4. Chi tiết: General (Details, Connect, Settings, Error pages), `useUpdateDistribution`.
5. Create distribution.
6. Origins (`OriginModal`, `BucketLink`), Behaviors (`BehaviorModal`, thứ tự, tên policy).
7. Invalidations.
8. Nối S3 (khối 3.7, `?bucket=`), StackLink và `resourceLinks.ts`.
9. Test: integration `tests/it/cloudfront.test.ts` (tạo → URL local trả root object, SPA deep link trả 200, behavior `/api/*` sang bucket thứ hai, update với ETag cũ bị từ chối, invalidation `Completed`, tắt → 404, xóa); E2E một luồng chính (tạo bucket + `index.html` bằng SDK → Create distribution từ trang bucket có SPA → URL local trả 200 qua `page.request` → thêm origin + behavior → Create invalidation → Disable → Delete; không cố ý trỏ bucket đã xóa, vì `HeadBucket` 404 làm trình duyệt ghi `console.error` và E2E fail (development.md › Traps)); danh sách, chi tiết và Create distribution vào `tests/ui/responsive.spec.ts`; `tests/it/leftovers.mjs`: distribution có origin S3 là bucket `lc-it-*` / `lc-e2e-*` → tắt rồi xóa (ETag).
10. development.md › Traps: URL local chỉ dùng từ máy dev (7 #2), Node / Python trên Windows / Linux có thể không resolve `*.localhost` (chưa kiểm); host private cần `FLOCI_SERVICES_CLOUDFRONT_ALLOWED_PRIVATE_ORIGIN_HOSTS`, không có trong compose (7 #6); website endpoint S3 ra internet (7 #6); Floci không kiểm cấu hình, console chặn (7 #11). README: dòng CloudFront trong bảng Features.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024, 390 và 320px, light / dark, không trang nào cuộn ngang.

---

## 9. Cách đã cân nhắc

**Sửa cấu hình (CloudFront bắt gửi toàn bộ + ETag)**

| Cách                                                                | Đánh đổi                                                                                                                                     | Chọn                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **A. Đọc lại cấu hình ngay lúc lưu, áp thay đổi, gửi ETag vừa đọc** | Thay đổi nơi khác ở phần khác được giữ; chỉ lỗi khi hai lần lưu chen nhau trong khoảnh khắc đó; mỗi lần lưu thêm một `GetDistributionConfig` | ✅ (đề xuất của Claude) |
| B. Dùng ETag lúc mở trang, lệch là báo lỗi                          | Chặt như AWS console, nhưng một lần CDK deploy hay app gọi API giữa chừng làm mọi lần lưu sau đó lỗi tới khi tải lại                         |                         |
| C. Sửa cấu hình dạng JSON                                           | Đủ mọi field nhưng dễ sai, không giống AWS console                                                                                           |                         |

**Host của URL local**

| Cách                                                           | Đánh đổi                                                                         | Chọn                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| **A. `<id>.cloudfront.localhost:<port của FLOCI_PUBLIC_URL>`** | Không cần DNS (chạy offline); host cố định nên `FLOCI_PUBLIC_URL` là IP vẫn đúng | ✅ (đề xuất của Claude) |
| B. `<id>.cloudfront.localhost.floci.io:4566` (như roadmap)     | Cần DNS công khai; offline không thêm được vào `/etc/hosts` (không có wildcard)  |                         |

## 10. Quyết định

| Quyết định                                                                                                                             | Lý do                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Phạm vi mục 2 (Làm / Không làm) theo đề xuất đã chỉnh                                                                                  | User chốt 2026-11-25                                                                            |
| Invalidation coi là hỗ trợ đủ, UI ghi "Floci doesn't cache…"                                                                           | User chốt 2026-11-25                                                                            |
| `allowed-private-origin-hosts` không thêm vào compose; chỉ gợi ý trong form và ghi Trap                                                | User chốt 2026-11-25                                                                            |
| Không làm Functions / Lambda@Edge, tạo / sửa policy, OAC, logging, WAF, ACM / alternate domain                                         | User chốt 2026-11-25                                                                            |
| Route `/cloudfront/distributions`, `…/create?bucket=`, `…/:id?tab=` (General, Origins, Behaviors, Invalidations)                       | Đề xuất của Claude: như EC2; ID distribution không có `/`; tab giống AWS console                |
| Sửa bằng đọc lại cấu hình lúc lưu + ETag vừa đọc; ETag lệch → báo "changed while saving, try again"                                    | Đề xuất của Claude (mục 9)                                                                      |
| URL local `<id>.cloudfront.localhost` + port của `flociPublicUrl`                                                                      | Đề xuất của Claude (mục 9), user duyệt 2026-11-25                                               |
| Không cho chọn response headers policy; mô tả ô Origin domain vẫn gợi ý biến môi trường host private (ngoài Trap)                      | User duyệt đề xuất 2026-11-25: không có thì 502 mà lý do chỉ nằm trong log Floci                |
| Cột danh sách: ID, Description, Local URL, Origins, Status, Last modified                                                              | Đề xuất của Claude: giống AWS, bỏ cột Floci không có (alternate domain); thêm Local URL         |
| Status hiện Enabled / Disabled; không hiện `Status` của Floci                                                                          | Đề xuất của Claude: Floci luôn `Deployed`                                                       |
| Sidebar nhóm mới "Networking & content delivery", mục Distributions; invalidation trong trang distribution                             | Đề xuất của Claude: như AWS console; API Gateway sau này cũng vào nhóm này                      |
| Khối "CloudFront distributions" ở tab Properties của bucket, có nút Create distribution điền sẵn bucket                                | Đề xuất của Claude: cạnh Event notifications (cũng là nối service); một lần `ListDistributions` |
| Form tạo chỉ có origin S3; custom origin thêm ở tab Origins                                                                            | Đề xuất của Claude: user chốt "create (S3 origin picked from buckets)"                          |
| Behavior mới dùng Managed-CachingOptimized, `allow-all`, không cho chọn policy                                                         | Đề xuất của Claude: user chốt chỉ hiện tên policy; Floci không cache, không áp viewer protocol  |
| Có Move up / Move down cho behavior                                                                                                    | Đề xuất của Claude: Floci khớp theo thứ tự (7 #12), behavior mới thêm cuối nên cần đổi được     |
| Checkbox "Single-page app" ở Create và Settings (403 / 404 → root object, 200); error page chỉ xem                                     | Đề xuất của Claude: user chốt "SPA error pages"; sửa từng error page để sau                     |
| Console tự chặn: origin ID trùng, path trùng, xóa origin đang dùng, origin path sai, root object bắt đầu `/`; invalidation tự thêm `/` | Đề xuất của Claude: Floci nhận, AWS từ chối (7 #4, #11); cấu hình sai làm URL trả 502           |
| Origin ID không sửa được sau khi tạo                                                                                                   | Đề xuất của Claude: behavior tham chiếu theo ID                                                 |
| Delete khóa khi đang bật, có lý do; không gộp "tắt rồi xóa"                                                                            | User chốt "delete (must disable first, explain)"                                                |
| Connect card: URL local + code `CreateInvalidation`                                                                                    | Đề xuất của Claude: README yêu cầu Connect card; script deploy frontend hay gọi invalidation    |
| `BucketLink` mới ở `services/s3/components`                                                                                            | Đề xuất của Claude: như `QueueLink`, dò bucket còn không                                        |
| Leftovers nhận distribution test qua bucket origin `lc-it-*` / `lc-e2e-*`                                                              | Đề xuất của Claude: distribution không có tên; test luôn dùng bucket có tiền tố                 |
| UI theo convention có sẵn: menu `Actions`, `DistributionStatus`, `BucketLink` dò "(not found)", `FormTiles` / `FormRadioGroup`         | User yêu cầu: component consistent, theo convention                                             |
| Không sửa server                                                                                                                       | CloudFront là AWS API thuần, đi qua proxy `/aws`                                                |
