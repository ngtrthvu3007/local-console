# API Gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dev xem API mà CDK / SAM / Terraform deploy lên Floci (REST, HTTP, WebSocket), lấy invoke URL, test method REST ngay trên console, đi từ route sang Lambda / Cognito / CloudFormation và ngược lại từ Lambda › Triggers.

**Architecture:** Service mới `apigateway` trong `registry.ts`, một thư mục như SNS: `routes.ts`, `constants.ts`, file logic thuần (`integration.ts`, `invokeUrl.ts`, `resources.ts`, `authorizers.ts`, `lambdaPermissions.ts`, `apis.ts`), hooks TanStack Query gọi SDK qua proxy `/aws`, trang nạp lười bằng `lazyPage`. Tab Test gửi `fetch` thẳng tới `/aws/restapis/{id}/{stage}/_user_request_{path}`. Lambda › Triggers đọc `GetPolicy`. Không sửa server.

**Tech Stack:** React 19, Cloudscape (`TreeView` có trong 3.0.1407), TanStack Query v5, react-hook-form + zod (`useZodForm`), `@aws-sdk/client-api-gateway`, `@aws-sdk/client-apigatewayv2` (**chưa cài**), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-apigateway-design.md` (duyệt 2026-11-19, cập nhật 2026-11-24). Rà soát: `docs/superpowers/specs/2026-11-24-apigateway-review-design.md`.

## Global Constraints

- **Không git, không cài package, không chạy `aws`.** Agent không chạy lệnh git ghi, không `npm install`. Package do user cài (Task 1 Step 0). Mỗi task kết thúc bằng gợi ý commit message để user tự chạy.
- Không sửa server.
- Không làm: nút Deploy, stage variables, throttle, log API Gateway, form tạo / sửa API, OpenAPI, custom domain, API key, usage plan, Test cho HTTP / WebSocket, đọc VTL / subtype v2, env JWT trong compose, invoke URL dạng host, `TestInvokeMethod`.
- Route: `/apigateway/apis`, `/apigateway/:version/:apiId` (`version` = `v1` | `v2`), tab trên `?tab=` (mặc định tab đầu, không ghi lên URL).
- Sidebar: API Gateway › **APIs**.
- Câu chữ cố định (copy nguyên văn):
  - Method `AWS_IAM`: `Floci doesn't check IAM policies.`
  - Popover JWT issuer local: `Floci blocks local Cognito issuers, so requests get 401. Use a Lambda or Cognito user pool authorizer on a REST API to test sign-in locally.`
  - Mô tả bảng Stages: `Floci serves the latest configuration on every stage; deployments have no effect.`
  - Nút Test khi API chưa có stage: khóa, mô tả `Create a stage to test this method.`
  - Không tìm thấy: `API <id> not found`, link `View APIs`.
  - WebSocket trên bảng Routes: `Route selection: <RouteSelectionExpression>`.
  - Nhãn URL: `From your machine`, `From a container in compose`.
  - Link log: `Lambda logs: <tên> › Monitor` → `lambdaRoutes.function(tên, FUNCTION_TABS.monitor)`.
- Invoke URL REST / HTTP: `${base}/restapis/{id}/{stage}/_user_request_/`, `base` = `flociPublicUrl` (máy dev) và `flociInternalUrl` (compose), từ `useLoadedConfig()`. Không dùng `apiEndpoint` của v2.
- WebSocket URL: `ws://{id}.execute-api.{region}.localhost:{port của flociPublicUrl}/{stage}`; @connections URL: `${flociPublicUrl}/execute-api/{id}/{stage}/@connections`.
- Code theo CLAUDE.md dự án: hằng số trong `constants.ts`, comment tiếng Việt ngắn nói lý do, hạn chế type assertion, không fallback ≥ 2 tầng. `registry.ts` / `index.tsx` không import SDK hay zod.
- Floci 2.4.0. Hành vi đã kiểm: spec mục 7 (#1–#17).

## Rulings đã chốt trong plan (user duyệt plan là duyệt các mục này)

1. **Icon `IconApi` (Tabler), danh mục `integration`.** Registry dùng glyph Tabler, không có file svg như spec mục 6 ghi. Không thêm danh mục "Networking" chỉ cho một service.
2. **Method đang chọn ở tab Resources là state trong trang**, không lên URL. Sai thì: reload mất method đang chọn.
3. **Ô Headers của tab Test:** bỏ dòng trống; dòng không có `:` → lỗi dưới ô `Use Header:Value on each line.`, không gửi.
4. **Lambda › Triggers:** statement không có `AWS:SourceArn` thì bỏ qua (không biết API nào). Nhiều statement cùng API + method + path (CDK tạo thêm bản `test-invoke-stage`) gộp thành một dòng. Method / path lấy nguyên văn từ ARN (`*` giữ nguyên).
5. **Lambda › Triggers chỉ gọi danh sách API khi policy có statement `apigateway.amazonaws.com`.** Function không có policy → không thêm call nào.
6. **Gói SDK cài cho cả `web` và `tests` một lần** (Task 1 Step 0), không chờ tới khi viết IT.

## Review Focus

1. **Path param có ký tự đặc biệt** (`a b`, `x/y` vào `{id}`, `a/b/c` vào `{proxy+}`) → `{id}` mã hóa `/` thành `%2F`; `{proxy+}` giữ `/`, mã hóa từng đoạn (test: Task 1 unit `buildTestPath`).
2. **Lambda bị xóa sau khi deploy API** → Test trả 404 / 502 nguyên văn, body rỗng không làm vỡ ô response (test: Task 6 E2E).
3. **Policy lặp và statement thiếu `SourceArn`** → một dòng mỗi API + method + path, không crash (test: Task 1 unit `apiGatewaySourcesOf`).
4. **API trong policy đã bị xóa** → dòng vẫn hiện, resource = API ID dạng chữ, không link (test: Task 7 E2E).
5. **URI Lambda có `${stageVariables.fn}` hoặc alias `:prod`** → `${…}` hiện chữ không link; alias link về function gốc (test: Task 1 unit `describeIntegration`).

---

### Task 1: Cài package + logic thuần + unit test

**Files:**

- Create: `web/src/services/apigateway/routes.ts`, `constants.ts`, `integration.ts`, `invokeUrl.ts`, `resources.ts`, `authorizers.ts`, `lambdaPermissions.ts`
- Test: `web/test/services/apigateway/apigateway.test.ts`

**Interfaces — Produces:**

- `APIGATEWAY_SERVICE_ID = "apigateway"`; `API_VERSIONS = { rest: "v1", v2: "v2" }`, `type ApiVersion = "v1" | "v2"`; `API_TABS = { resources, routes, authorizers, stages }`; `SEARCH_PARAMS = { tab: "tab" }`; `APIGATEWAY_ROUTE_PATTERNS = { apis: "apis", api: ":version/:apiId" }`
- `apigatewayRoutes = { apis, api(version: ApiVersion, apiId: string, tab?: ApiTab): string }`; `apigatewayBaseCrumbs`; `apiCrumbs(version, apiId, name)`; `isApiVersion(value: string | undefined): value is ApiVersion`
- `type IntegrationView = { kind: "lambda"; proxy: boolean; functionName?: string } | { kind: "http"; url: string } | { kind: "mock" } | { kind: "aws"; service: string } | { kind: "other" }`
  `describeIntegration(type: string | undefined, uri: string | undefined): IntegrationView`; `integrationLabel(view: IntegrationView, uri?: string): string` (`Lambda proxy → <tên>`, `Lambda → <tên>`, `HTTP proxy → <URL>` cho cả `HTTP` và `HTTP_PROXY`, `Mock`, `AWS → <service>`, còn lại `<type>`)
- `restInvokeUrl(base: string, apiId: string, stage: string): string`; `webSocketUrl(publicUrl: string, region: string, apiId: string, stage: string): string`; `connectionsUrl(publicUrl: string, apiId: string, stage: string): string`
- `buildTestPath(resourcePath: string, params: Record<string, string>): string`; `pathParamsOf(resourcePath: string): { name: string; greedy: boolean }[]`; `testInvokeUrl(apiId: string, stage: string, path: string, query: string): string` (bắt đầu bằng `AWS_PROXY_PATH`); `parseHeaderLines(text: string): { headers: [string, string][] } | { error: string }`
- `type ResourceNode = { id: string; path: string; pathPart: string; children: ResourceNode[]; methods: string[] }`; `resourceTree(resources: Resource[]): ResourceNode[]` (sắp theo `pathPart`, method theo thứ tự `ANY, GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`)
- `cognitoPoolIdOfProviderArn(arn: string): string` (phần sau `userpool/`); `isLocalIssuer(issuer: string, urls: readonly string[]): boolean` (so host:port)
- `type ApiGatewaySource = { apiId: string; stage: string; method: string; path: string }`; `apiGatewaySourcesOf(policy: string): ApiGatewaySource[]`

- [ ] **Step 0: User cài package** — dừng, báo user chạy từ gốc repo:
  ```bash
  npm install @aws-sdk/client-api-gateway @aws-sdk/client-apigatewayv2 -w web -w tests --min-release-age=7
  ```
  Kiểm: `ls node_modules/@aws-sdk | grep api-gateway` có cả hai.

- [ ] **Step 1: Viết test (RED)**

```ts
it("builds routes with the version in the path", () => {
  expect(apigatewayRoutes.api("v1", "a1b2c3d4e5")).toBe("/apigateway/v1/a1b2c3d4e5");
  expect(apigatewayRoutes.api("v2", "k9", "stages")).toBe("/apigateway/v2/k9?tab=stages");
  expect(isApiVersion("v3")).toBe(false);
});
it("reads Lambda integrations", () => {
  const fn = "arn:aws:lambda:ap-southeast-1:000000000000:function:get-item";
  const v1 = `arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/${fn}/invocations`;
  expect(describeIntegration("AWS_PROXY", v1)).toEqual({ kind: "lambda", proxy: true, functionName: "get-item" });
  expect(describeIntegration("AWS", v1)).toEqual({ kind: "lambda", proxy: false, functionName: "get-item" });
  expect(describeIntegration("AWS_PROXY", fn)).toMatchObject({ functionName: "get-item" }); // v2: ARN thẳng
  expect(describeIntegration("AWS_PROXY", `${fn}:prod`)).toMatchObject({ functionName: "get-item" });
  expect(describeIntegration("AWS_PROXY", v1.replace("get-item", "${stageVariables.fn}")))
    .toEqual({ kind: "lambda", proxy: true, functionName: undefined });
});
it("labels other integrations", () => {
  expect(integrationLabel(describeIntegration("HTTP_PROXY", "https://example.com"), "https://example.com"))
    .toBe("HTTP proxy → https://example.com");
  expect(integrationLabel(describeIntegration("MOCK", undefined))).toBe("Mock");
  expect(describeIntegration("AWS", "arn:aws:apigateway:ap-southeast-1:sqs:path/000000000000/q"))
    .toEqual({ kind: "aws", service: "sqs" });
});
it("builds invoke URLs", () => {
  expect(restInvokeUrl("http://localhost:4566", "a1", "dev")).toBe("http://localhost:4566/restapis/a1/dev/_user_request_/");
  expect(restInvokeUrl("http://localhost.floci.io:4566", "a1", "$default"))
    .toBe("http://localhost.floci.io:4566/restapis/a1/$default/_user_request_/");
  expect(webSocketUrl("http://localhost:4566", "ap-southeast-1", "w1", "prod"))
    .toBe("ws://w1.execute-api.ap-southeast-1.localhost:4566/prod");
  expect(connectionsUrl("http://localhost:4566", "w1", "prod")).toBe("http://localhost:4566/execute-api/w1/prod/@connections");
});
it("fills path params", () => {
  expect(pathParamsOf("/items/{id}/{proxy+}")).toEqual([{ name: "id", greedy: false }, { name: "proxy", greedy: true }]);
  expect(buildTestPath("/items/{id}", { id: "x/y z" })).toBe("/items/x%2Fy%20z");
  expect(buildTestPath("/files/{proxy+}", { proxy: "a/b c/d" })).toBe("/files/a/b%20c/d");
  expect(testInvokeUrl("a1", "dev", "/items/42", "q=abc")).toBe("/aws/restapis/a1/dev/_user_request_/items/42?q=abc");
  expect(testInvokeUrl("a1", "dev", "/", "")).toBe("/aws/restapis/a1/dev/_user_request_/");
});
it("parses header lines", () => {
  expect(parseHeaderLines("Authorization: Bearer x\n\nX-A:1")).toEqual({ headers: [["Authorization", "Bearer x"], ["X-A", "1"]] });
  expect(parseHeaderLines("broken")).toEqual({ error: "Use Header:Value on each line." });
});
it("builds the resource tree", () => {
  // input: "/" (GET), "/items" (POST, GET), "/items/{id}" (DELETE, GET), "/health" (GET), thứ tự lộn
  // expect: root "/" → children ["health", "items"]; "items".methods = ["GET", "POST"]; "{id}".methods = ["GET", "DELETE"]
});
it("reads authorizer targets", () => {
  expect(cognitoPoolIdOfProviderArn("arn:aws:cognito-idp:ap-southeast-1:000000000000:userpool/ap-southeast-1_Ab12"))
    .toBe("ap-southeast-1_Ab12");
  const urls = ["http://localhost:4566", "http://localhost.floci.io:4566"];
  expect(isLocalIssuer("http://localhost.floci.io:4566/ap-southeast-1_Ab12", urls)).toBe(true);
  expect(isLocalIssuer("https://cognito-idp.ap-southeast-1.amazonaws.com/x", urls)).toBe(false);
});
it("reads API Gateway sources from a function policy", () => {
  // Statement 1, 2: Principal.Service apigateway, SourceArn ".../a1/*/GET/items/*" và ".../a1/test-invoke-stage/GET/items/*" → 1 dòng
  // Statement 3: apigateway, không có Condition → bỏ
  // Statement 4: Principal.Service "s3.amazonaws.com" → bỏ
  // Statement 5: ".../k9/*/*" (HTTP API) → { apiId: "k9", method: "*", path: "" }
  // policy "{}" và policy không phải JSON → []
});
```

- [ ] **Step 2: Chạy, thấy fail** — `cd web && npx vitest run test/services/apigateway` → FAIL (module chưa có).
- [ ] **Step 3: Viết code** theo Interfaces. Route dựng như `snsRoutes.topic` (`generatePath` + `URLSearchParams`). Chuỗi `_user_request_`, `execute-api`, `@connections`, prefix ARN, câu lỗi header để trong `constants.ts`. Mã hóa path: `encodeURIComponent` cho `{x}`; `{x+}` tách `/` rồi mã hóa từng đoạn.
- [ ] **Step 4: Chạy lại** → PASS; `npm run typecheck -w web && npm run lint -w web` sạch.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): routes, integration, invoke URL and policy helpers`.

### Task 2: Đăng ký service, danh sách + xóa API; IT gọi SDK qua proxy

**Files:**

- Create: `web/src/services/apigateway/index.tsx`, `apis.ts`, `hooks/useApiGateway.ts`, `hooks/useApis.ts`, `pages/ApiList.tsx`, `components/DeleteApiModal.tsx`; trang chi tiết tạm `pages/ApiDetail.tsx` (chỉ heading)
- Modify: `web/src/registry.ts` (import + thêm `apigatewayService` sau `lambdaService`)
- Test: `tests/it/apigateway.test.ts`, `tests/e2e/apigateway.spec.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: `useApiGateway(): { v1: APIGatewayClient; v2: ApiGatewayV2Client }` (`useAwsClient` cho từng client); `APIGATEWAY_QUERY_ROOT = "apigateway"`; `type ApiRow = { id: string; name: string; version: ApiVersion; type: "REST" | "HTTP" | "WebSocket"; created?: Date }`; `listApis(v1, v2): Promise<ApiRow[]>` trong `apis.ts` (v1 `paginateGetRestApis`; v2 vòng `NextToken`); `useApis()`; `useDeleteApi()` (`{ version, apiId }` → `DeleteRestApi` / `DeleteApi`); `apiQueryKey(version, apiId, part?)`.

- [ ] **Step 1: IT (RED)** — `tests/it/apigateway.test.ts`, gọi qua `AWS_PROXY_URL` (chốt điểm "chưa kiểm" của spec mục 7):
  - `"lists REST, HTTP and WebSocket APIs through the console proxy"`: tạo 3 API `lc-it-…` bằng SDK qua proxy → `listApis` trả cả 3 đúng `type`.
  - `"reads resources with embedded methods"`: `GetResources` `embed: ["methods"]` → có `resourceMethods.GET.methodIntegration`.
  - `"deletes REST and HTTP APIs"`.
- [ ] **Step 2: E2E (RED)** — `tests/e2e/apigateway.spec.ts`:
  - `"lists APIs of all three types"`: sidebar có "APIs" → bảng có 3 dòng, cột Type `REST` / `HTTP` / `WebSocket`; ô tìm lọc theo tên.
  - `"deletes an API"`: chọn → Delete → gõ `delete` → biến khỏi bảng; SDK `GetRestApi` → 404.
  - `"opens an API from the list"`: bấm tên → URL `/apigateway/v1/<id>`.
- [ ] **Step 3:** rebuild (`docker compose up --build -d console`), chạy `cd tests && npm run test:it -- apigateway` và `npm run test:e2e -- e2e/apigateway.spec.ts` → FAIL.
- [ ] **Step 4: Viết code.** Bảng theo `sns/pages/TopicList.tsx` (`selectionType='single'`, `useCollection` + `TextFilter`, sắp theo Name, Created `formatDate`); modal theo `sns/components/DeleteTopicsModal.tsx` với `CONFIRM_DELETE`. `index.tsx` theo `sns/index.tsx`, ruling 1.
- [ ] **Step 5:** IT + E2E PASS; typecheck, lint; `npm run build` rồi kiểm chunk chính không có `client-api-gateway` / `client-apigatewayv2`.
- [ ] **Step 6:** Gợi ý commit: `feat(apigateway): list and delete REST, HTTP and WebSocket APIs`.

### Task 3: Chi tiết API + tab Resources (REST)

**Files:**

- Create: `hooks/useApiDetail.ts`, `components/ResourcesTab.tsx`, `components/MethodOverview.tsx`, `components/IntegrationValue.tsx`
- Modify: `pages/ApiDetail.tsx`
- Test: `tests/e2e/apigateway.spec.ts`

**Interfaces:**

- Consumes: `describeIntegration`, `integrationLabel`, `resourceTree`, `lambdaRoutes`.
- Produces: `useApi(version, apiId)` (v1 `GetRestApi`, v2 `GetApi`, `retry: false`) → `{ name, type, created }`; `useResources(apiId)`; `useAuthorizers(version, apiId)` (dùng cho Task 3 lẫn Task 4: v1 `GetAuthorizers` → `{ id, name, type, identitySource, target }[]`, v2 tương tự); `useStages(version, apiId)` (Task 5, 6); `IntegrationValue({ type, uri })` (link `lambdaRoutes.function(tên)` khi có `functionName`, dùng lại ở Task 4).

- [ ] **Step 1: E2E (RED)** — `beforeAll` tạo Lambda `lc-e2e-…-get-item` (zip `fflate` như `it/stepfunctions-flows.test.ts`) và REST API: `/items` GET (Lambda proxy), `/items/{id}` GET (Lambda proxy, `AWS_IAM`), `/health` GET (MOCK), stage `dev`.
  - `"shows the resource tree and method overview"`: tab Resources mặc định; cây có `/items`, `/{id}`, `/health`; chọn `GET` dưới `/items` → Integration `Lambda proxy → lc-e2e-…-get-item` là link tới function; API key `Not required`; URI hiện đủ, xuống dòng không cuộn ngang.
  - `"an AWS_IAM method says Floci doesn't check policies"`: chọn GET `/{id}` → Authorizer `AWS_IAM` + câu Global Constraints.
  - `"an unknown API shows not found"` (`danglingProbes`): `/apigateway/v1/nope` → `API nope not found`, link `View APIs`; `/apigateway/v9/x` cũng not found.
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Trang theo `sns/pages/TopicDetail.tsx` (`pageState`, tab trên `?tab=`); REST tab `resources, authorizers, stages`, v2 `routes, authorizers, stages` (Task 4, 5 điền nội dung). Header description: `<type> · <id> · Created <ngày>` + `<StackLink separated …>` để Task 8. `ResourcesTab`: `TreeView` + chi tiết bên phải, `useIsCompact()` thì chi tiết xuống dưới; method chọn là state (ruling 2). Chi tiết method: `Tabs` Overview | Test (Test để Task 6). Authorizer: `authorizationType` `NONE` / `AWS_IAM` hiện nguyên; `CUSTOM` / `COGNITO_USER_POOLS` hiện tên từ `useAuthorizers` theo `authorizerId`.
- [ ] **Step 4:** PASS; typecheck, lint.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): API detail and REST resource tree`.

### Task 4: Tab Routes (HTTP, WebSocket) + tab Authorizers

**Files:**

- Create: `components/RoutesTab.tsx`, `components/AuthorizersTab.tsx`
- Modify: `hooks/useApiDetail.ts` (`useRoutes(apiId)` = `GetRoutes` + `GetIntegrations`, ghép theo `Target` = `integrations/<id>`), `pages/ApiDetail.tsx`
- Test: `tests/e2e/apigateway.spec.ts`

**Interfaces:**

- Consumes: `useAuthorizers`, `IntegrationValue`, `cognitoPoolIdOfProviderArn`, `isLocalIssuer`, `cognitoRoutes.pool`, `useLoadedConfig`.

- [ ] **Step 1: E2E (RED)** — `beforeAll` thêm: Cognito pool `lc-e2e-…`; Lambda `lc-e2e-…-token-auth`; REST authorizer `COGNITO_USER_POOLS` + `TOKEN`; HTTP API có route `GET /items` (Lambda), `ANY /proxy/{proxy+}` (HTTP_PROXY `https://example.com`), `$default`, JWT authorizer issuer `${flociInternalUrl}/<poolId>`; WebSocket API (`$request.body.action`, route `$connect`, `$default`).
  - `"lists HTTP routes with integration and authorizer"`: bảng 3 dòng; `GET /items` link Lambda; `ANY /proxy/{proxy+}` = `HTTP proxy → https://example.com`.
  - `"shows the WebSocket route selection"`: `Route selection: $request.body.action` trên bảng.
  - `"REST authorizers link to the pool and the function"`: Target Cognito là link `cognitoRoutes.pool(poolId)`; TOKEN là link function.
  - `"a local JWT issuer has a popover"`: mở popover → câu Global Constraints.
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Bảng theo bảng đang có (`ResponsiveTable`). Cột Target: Lambda → link (từ `authorizerUri` qua `describeIntegration("AWS", uri)`), Cognito → link pool, JWT → `issuer <url>` + `Popover` khi `isLocalIssuer(issuer, [flociPublicUrl, flociInternalUrl])`.
- [ ] **Step 4:** PASS; typecheck, lint.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): routes and authorizers tabs`.

### Task 5: Tab Stages

**Files:**

- Create: `components/StagesTab.tsx`
- Modify: `hooks/useApiDetail.ts` (`useStages`: v1 `GetStages` → `item`, v2 `GetStages` → `Items`, chuẩn hóa `{ name, deploymentId?, updated? }`)
- Test: `tests/e2e/apigateway.spec.ts`, `tests/it/apigateway.test.ts`

**Interfaces:**

- Consumes: `restInvokeUrl`, `webSocketUrl`, `connectionsUrl`, `useLoadedConfig()` (`region`, `flociPublicUrl`, `flociInternalUrl`), `CopyButton`.
- Produces: `useStages(version, apiId): { name: string; deploymentId?: string; updated?: Date }[]` (Task 6 lấy stage đầu).

- [ ] **Step 1: Test (RED)**:
  - IT `"the invoke URL from Stages answers"`: REST + HTTP (`$default`) → Lambda; `fetch(restInvokeUrl(flociPublicUrl, …) + "items")` → 200 và body từ Lambda.
  - IT `"the WebSocket URL connects"`: `new WebSocket(webSocketUrl(...))` (global của Node 24) → `open`; gửi tin → Lambda `$default` trả lời.
  - E2E `"shows both invoke URLs for a REST stage"`: dòng `dev` có `From your machine` = `http://localhost:4566/restapis/<id>/dev/_user_request_/` và `From a container in compose` = `${flociInternalUrl}/…`, mỗi dòng có nút copy; mô tả bảng đúng câu Global Constraints.
  - E2E `"shows WebSocket and @connections URLs"` cho WebSocket API.
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Hai URL hiện như `sns/components/DetailsTab.tsx` (nhãn + `copyable`). Khung hẹp: bảng hai tầng như các bảng khác.
- [ ] **Step 4:** PASS; typecheck, lint.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): stages with invoke URLs for host and compose`.

### Task 6: Tab Test của method REST

**Files:**

- Create: `components/MethodTest.tsx`, `hooks/useMethodTest.ts`
- Modify: `components/ResourcesTab.tsx` (tab Test)
- Test: `tests/e2e/apigateway.spec.ts`

**Interfaces:**

- Consumes: `pathParamsOf`, `buildTestPath`, `testInvokeUrl`, `parseHeaderLines`, `useStages`, `CodeEditor`, `CodeSnippet`, `reformatJson` (`shared/json.ts`).
- Produces: `useMethodTest()` = `useMutation` trả `{ status: number; latencyMs: number; body: string; headers: [string, string][] }`. Lỗi mạng → ném lỗi, hiện bằng `Alert` lỗi.

- [ ] **Step 1: E2E (RED)** — dùng API Task 3 + method `/items/{id}` GET có Cognito authorizer, `/echo` POST (Lambda trả lại body + headers):
  - `"tests a method with a path param"`: `{id}` = `42` → Test → `Status 200`, latency, body JSON đã format; link `Lambda logs: … › Monitor` đúng href.
  - `"sends query, headers and body"`: POST `/echo`, query `q=abc`, header `X-A:1`, body `{"a":1}` → body trả về có cả 3.
  - `"a Cognito method answers 401 without a token and 200 with one"`: IdToken lấy bằng SDK (`AdminInitiateAuth`), dán vào Headers.
  - `"bad header lines block the request"`: `broken` → lỗi ruling 3, không request `_user_request_` nào (`page.on("request")`).
  - `"shows errors verbatim"`: xóa Lambda bằng SDK rồi Test → status 4xx / 5xx hiện, body rỗng không lỗi giao diện (Review Focus 2).
  - `"an API without a stage cannot be tested"`: API mới không stage → nút Test khóa + câu Global Constraints.
  - Body ẩn với GET, HEAD.
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Form theo `lambda/components/TestTab.tsx` (đọc trước, dùng lại cách bố trí). Mỗi `{param}` một ô. Gửi `fetch(testInvokeUrl(apiId, stages[0].name, path, query), { method, headers, body })`; latency đo bằng `performance.now()`. Body response qua `reformatJson` (không phải JSON thì giữ text).
- [ ] **Step 4:** PASS; typecheck, lint.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): test a REST method through the console proxy`.

### Task 7: Lambda › Triggers nguồn API Gateway

**Files:**

- Modify: `web/src/services/lambda/constants.ts` (`DISPLAY_ONLY_SOURCES` thêm `apigateway: "API Gateway"`; `VIEW_ONLY_SOURCES` thêm `"apigateway"`), `web/src/services/lambda/hooks/useTriggers.ts` (`listApiGatewayTriggers`, thêm vào `Promise.all` của `useTriggers`), `web/src/services/lambda/components/TriggersTab.tsx` (`RESOURCE_NOUNS.apigateway = "API"`)
- Test: `web/test/services/lambda/triggers.test.ts` (case `apigatewayTriggerRows`), `tests/e2e/apigateway.spec.ts` (describe `"Lambda triggers"`)

**Interfaces:**

- Consumes: `apiGatewaySourcesOf`, `listApis`, `useApiGateway`, `apigatewayRoutes.api`, `isNotFoundError` (`shared/aws.ts`).
- Produces: `listApiGatewayTriggers(lambda: LambdaClient, v1: APIGatewayClient, v2: ApiGatewayV2Client, functionName: string): Promise<TriggerRow[]>` — `GetPolicy`; `isNotFoundError` → `[]`; không có nguồn → `[]` không gọi `listApis` (ruling 5); mỗi nguồn → `{ id: "apigateway:<apiId>:<method>:<path>", source: "apigateway", resource: tên API ?? apiId, details: "<method> /<path>", href?: apigatewayRoutes.api(version, apiId) }`.

- [ ] **Step 1: E2E (RED)**:
  - `"shows API Gateway sources from the function policy"`: `AddPermission` cho REST `GET /items/*` và HTTP `*/*` → tab Triggers của function có 2 dòng `API Gateway`, link tới đúng `/apigateway/v1/…` và `/apigateway/v2/…`, không có nút bật / tắt / xóa.
  - `"a function without a policy shows no API Gateway row"`.
  - `"a deleted API stays as text"`: xóa API, giữ policy → dòng còn, resource = API ID, không link (Review Focus 4).
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code** theo `listCognitoTriggers`. Tách phần ghép nguồn + danh sách API thành hàm thuần `apigatewayTriggerRows(sources: ApiGatewaySource[], apis: ApiRow[]): TriggerRow[]` (export, unit test: API có → href đúng version; API mất → resource = apiId, không href). Nguồn chỉ xem, không cần mutation.
- [ ] **Step 4:** PASS; chạy lại `tests/e2e/lambda.spec.ts` → không đổi; typecheck, lint.
- [ ] **Step 5:** Gợi ý commit: `feat(lambda): show API Gateway sources in triggers`.

### Task 8: Nối CloudFormation

**Files:**

- Modify: `web/src/services/cloudformation/resourceLinks.ts` (`"AWS::ApiGateway::RestApi": (id) => apigatewayRoutes.api("v1", id)`, `"AWS::ApiGatewayV2::Api": (id) => apigatewayRoutes.api("v2", id)`), `pages/ApiDetail.tsx` (`<StackLink separated type={…} physicalId={apiId} />`)
- Test: `web/test/services/cloudformation/cloudformation.test.ts` (`resourceHref`), `tests/e2e/apigateway.spec.ts` (describe `"CloudFormation"`)

- [ ] **Step 1: Test (RED)**: unit `resourceHref("AWS::ApiGateway::RestApi", "a1")` → `/apigateway/v1/a1`, `AWS::ApiGatewayV2::Api` → `/apigateway/v2/…`. E2E: stack có `AWS::ApiGateway::RestApi` (+ `AWS::ApiGatewayV2::Api`) → tab Resources link mở trang API, trang có `Stack: <tên>` link về stack.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Viết code.** **Nếu Floci CloudFormation không tạo được type nào** (physical ID không phải API ID): thêm 1 dòng vào mục "Rulings đã chốt trong plan" và báo user, bỏ E2E của type đó, giữ unit test và link.
- [ ] **Step 4:** PASS; chạy lại `tests/e2e/cloudformation*.spec.ts`.
- [ ] **Step 5:** Gợi ý commit: `feat(apigateway): link APIs with CloudFormation stacks`.

### Task 9: Dọn dẹp test, UI, luồng trọn, spec

**Files:**

- Modify: `tests/it/leftovers.mjs` (REST API và API v2 tên `lc-it-` / `lc-e2e-` → `DeleteRestApi` / `DeleteApi`), `tests/ui/responsive.spec.ts` (`{ slug: "apigateway-apis", path: "/apigateway/apis" }`), spec header → `đã làm (<ngày>)` + tên file test

- [ ] **Step 1:** `cd tests && npm run test:it` cả suite, rồi `npm run leftovers` → không còn gì.
- [ ] **Step 2:** Full suite: gốc repo `npm run typecheck && npm run lint && npm test`; `cd tests && npm run test:e2e && npm run test:ui && LOCAL_CONSOLE_URL=http://localhost:3701 npm run test:mobile` → tất cả PASS. Chụp 1440 / 1024 / 390 trang danh sách và chi tiết (Resources, Stages, Test), không cuộn ngang.
- [ ] **Step 3: Luồng trọn bằng tay** (spec mục 8 "Kiểm tra"): REST Lambda proxy + Cognito authorizer, HTTP `$default`, WebSocket → danh sách thấy cả 3 → cây resource, link Lambda → Test path param 200, link log → bỏ Authorization 401 → bảng route → copy WebSocket URL, `wscat` kết nối → copy invoke URL, curl từ máy dev và từ container compose → Lambda › Triggers thấy API Gateway → xóa API.
- [ ] **Step 4:** Gợi ý commit: `test(apigateway): leftovers, responsive page, spec status`.
