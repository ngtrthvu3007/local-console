# API Gateway CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo / sửa / xóa API, resource, method, route, authorizer, stage của API Gateway ngay trên console, tự thêm quyền gọi Lambda để Lambda › Triggers thấy API.

**Architecture:** Logic gọi AWS ở `core/src/services/apigateway/` (operation thuần `(client, …)` + facade `createApiGatewayService`), schema zod của form ở `core`, web chỉ có hook TanStack Query + trang / modal Cloudscape. Facade nhận thêm `LambdaClient` và `region` để gọi `AddPermission` sau khi gắn Lambda. Không sửa server.

**Tech Stack:** TypeScript, React 19, Cloudscape, TanStack Query v5, react-hook-form + zod (`useZodForm`, `FormModal`, `FormFields`), `@aws-sdk/client-api-gateway`, `@aws-sdk/client-apigatewayv2`, `@aws-sdk/client-lambda` (đã cài cả ở `core`, `web`, `tests`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-27-apigateway-crud-design.md` (duyệt 2026-11-27, gồm mọi đề xuất ở mục 9). Spec gốc: `docs/superpowers/specs/2026-11-19-apigateway-design.md`.

## Global Constraints

- **Không git ghi, không cài package, không chạy `aws`.** Mỗi task kết thúc bằng commit message gợi ý (ghi vào ledger) để user tự commit. Không thêm attribution.
- Không sửa server. Không thêm package.
- Floci 2.4.0. Hành vi đã kiểm: spec gốc mục 7 (#1–#18), spec bổ sung mục 7 (#19–#28).
- Code theo CLAUDE.md: hằng số / câu chữ trong `core/src/services/apigateway/constants.ts`, comment tiếng Việt ngắn chỉ cho quirk Floci / AWS, hạn chế type assertion, không fallback ≥ 2 tầng, dòng trống quanh khối ≥ 3 dòng.
- Operation của API Gateway chỉ nhận client của chính nó (`v1`, `v2`) và `region` khi cần; chỉ facade gọi `addPermission` của Lambda.
- Integration form làm được: Lambda proxy (`AWS_PROXY`), HTTP proxy (`HTTP_PROXY`). Loại khác (`AWS`, `MOCK`, `HTTP`, `AWS_PROXY` có subtype) → phần integration khóa.
- Câu chữ cố định (copy nguyên văn):
  - Ô quyền: `Grant API Gateway permission to invoke the function`, mô tả `Floci doesn't check this permission; Lambda › Triggers uses it to show this API.`
  - Integration khóa: `Edit this integration in your IaC: the console edits Lambda and HTTP proxy integrations.`
  - Xóa resource có con: nút khóa, lý do `Delete its child resources first.`
  - WebSocket two-way: `Send the function's response to the client`
  - Mô tả bảng Stages giữ nguyên `STAGES_DESCRIPTION`.
- URI Lambda (REST integration, mọi Lambda authorizer): `arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<functionArn>/invocations`. Integration Lambda của HTTP / WebSocket: `IntegrationUri` = ARN function (như IT hiện có).
- Quyền: `lambda:InvokeFunction`, principal `apigateway.amazonaws.com`, `SourceArn`:
  - REST method: `arn:aws:execute-api:<region>:000000000000:<apiId>/*/<METHOD|*>/<path không "/" đầu>` (`ANY` → `*`)
  - Route HTTP `METHOD /path`: như REST; route không có dấu cách (`$default`, `$connect`, tên WebSocket): `…:<apiId>/*/<routeKey>`
  - Authorizer: `…:<apiId>/authorizers/<authorizerId>`
- Chạy test:
  - core: `npm test -w core -- test/services/apigateway/` · typecheck / lint: `npm run typecheck`, `npm run lint`
  - IT (console Docker :3701): `npm run test:it -w tests -- it/apigateway-crud.test.ts`
  - E2E (bản build mới qua `vite preview`): `.superpowers/sdd/2026-11-27-apigateway-crud/e2e.sh <tên> e2e/apigateway-crud.spec.ts` (Task 7 Step 1 tạo script)

## Rulings đã chốt trong plan (user duyệt plan là duyệt các mục này)

1. **Trang Create API ở `/apigateway/apis/create`** (spec ghi `/apigateway/create`): theo lệ `<danh sách>/create` của mọi service (`/sqs/queues/create`…).
2. **HTTP proxy của REST không có ô Method riêng** (spec phác có): integration method = method của chính nó (`ANY` → `ANY`). Sai thì: không proxy được GET sang POST.
3. **Thêm quyền lỗi báo bằng `notifyBulkOutcome`:** header `<Created …>, 1 item failed`, nội dung `Couldn't grant permission: <lỗi>` (spec ghi `Created, but couldn't grant permission: …`). Dùng lại helper có sẵn.
4. **Facade nhận thêm `region`** (dựng URI Lambda, SourceArn, ARN pool Cognito): `createApiGatewayService(v1, { v2, lambda, region })`.
5. **IT gọi facade thật** (`createApiGatewayService` với client qua proxy), import bằng đường dẫn tương đối.
6. **WebSocket: authorizer chỉ gắn được ở route `$connect`** (luật AWS); route khác ô Authorizer ẩn.
7. **Cây Resources: resource và method đều chọn được.** `Create resource` / `Create method` áp cho resource đang chọn (chọn method thì là resource của method; chưa chọn gì thì `/`).
8. **Resource `{x+}` không có con:** `Create resource` khóa khi đang chọn resource `{x+}`, lý do `A greedy path variable must be the last part of the path.`
9. **Làm mới sau mutation:** cả cây query của API (`apiQueryKey(version, apiId)`), thêm `[LAMBDA_QUERY_ROOT]` khi form có thêm quyền; tạo / xóa API làm mới danh sách.
10. **Sửa Cognito authorizer REST đổi pool bằng patch `remove /providerARNs/<cũ>` + `add /providerARNs/<mới>`.** Floci từ chối thì khóa ô pool khi sửa (ruling khi chạy).

## Review Focus

1. **Sửa method / route có integration `AWS` / `MOCK` do CDK tạo** → phần integration khóa, lưu chỉ đổi authorization, URI cũ giữ nguyên (test: Task 4 IT `saving an AWS integration method keeps its integration`).
2. **Gắn lại cùng function vào cùng method / route** (sửa rồi lưu lại) → không lỗi, policy không thêm statement trùng (test: Task 1 unit `addPermission` nuốt `ResourceConflictException`; Task 3 IT `granting twice keeps one statement`).
3. **`AddPermission` lỗi** (function vừa bị xóa) → method / route / API vẫn được tạo, kết quả có `failures` một mục (test: Task 3 unit `createApi reports a failed grant without failing`).
4. **Route dùng chung integration với route khác** → sửa đích không làm đổi route kia; xóa route không xóa integration còn dùng (test: Task 5 unit).
5. **Path part / route key / stage trùng hoặc sai dạng** (`{proxy+}` giữa path, `GET items` thiếu `/`, stage `prod` đã có) → form báo lỗi, không gọi Floci (test: Task 2 unit).

---

### Task 1: Helper thuần + `addPermission` của Lambda

**Files:**

- Modify: `core/src/services/apigateway/constants.ts`, `integration.ts`, `lambdaPermissions.ts`, `authorizers.ts`
- Modify: `core/src/services/lambda/operations/functions.ts` (cạnh `getPolicy`)
- Test: `core/test/services/apigateway/crudHelpers.test.ts` (mới), `core/test/services/lambda/addPermission.test.ts` (mới)

**Interfaces — Produces:**

- `integration.ts`: `lambdaInvocationUri(region: string, functionArn: string): string`; `functionArnOfUri(uri: string | undefined): string | undefined` (URI invocation → ARN bên trong; ARN `arn:aws:lambda:` → chính nó; còn lại `undefined`)
- `lambdaPermissions.ts`: `type PermissionTarget = { kind: "method"; method: string; path: string } | { kind: "route"; routeKey: string } | { kind: "authorizer"; authorizerId: string }`; `executeApiSourceArn(region: string, apiId: string, target: PermissionTarget): string`; `permissionStatementId(apiId: string, target: PermissionTarget): string` (khớp `^[A-Za-z0-9_-]{1,100}$`, ký tự khác → `_`, cắt 100)
- `authorizers.ts`: `type IdentityKind = "header" | "querystring"`; `identitySources(apiType: ApiType, kind: IdentityKind, names: readonly string[]): string[]` (REST `method.request.header.`, HTTP `$request.header.`, WebSocket `route.request.header.` / `route.request.querystring.`); `identityNamesOf(identitySource: string): { kind: IdentityKind; names: string[] }` (tách theo `,`, trim); `cognitoPoolArn(region: string, poolId: string): string` (`arn:aws:cognito-idp:<region>:000000000000:userpool/<poolId>`); `authorizationOf(value: string, authorizers: readonly AuthorizerRow[]): { authorizationType: string; authorizerId?: string }` (`NONE` / `AWS_IAM` giữ nguyên; authorizer `JWT` → `JWT`, `COGNITO_USER_POOLS` → `COGNITO_USER_POOLS`, còn lại → `CUSTOM`)
- `constants.ts`: `AUTH_CUSTOM = "CUSTOM"` và các câu chữ ở Global Constraints
- Lambda: `interface AddPermissionInput { functionArn: string; statementId: string; sourceArn: string }`; `addPermission(lambda: LambdaClient, input: AddPermissionInput): Promise<void>` — `ResourceConflictException` (statement đã có) coi là xong

- [ ] **Step 1: Viết test lỗi**

```ts
const R = "ap-southeast-1";
const ARN = (rest: string) => `arn:aws:execute-api:${R}:000000000000:${rest}`;
it("builds SourceArns that Lambda › Triggers reads back", () => {
  expect(executeApiSourceArn(R, "a1", { kind: "method", method: "ANY", path: "/items/{id}" })).toBe(ARN("a1/*/*/items/{id}"));
  expect(executeApiSourceArn(R, "a1", { kind: "route", routeKey: "GET /items" })).toBe(ARN("a1/*/GET/items"));
  expect(executeApiSourceArn(R, "a1", { kind: "route", routeKey: "$default" })).toBe(ARN("a1/*/$default"));
  expect(executeApiSourceArn(R, "a1", { kind: "authorizer", authorizerId: "z9" })).toBe(ARN("a1/authorizers/z9"));
  const policy = (arn: string) => JSON.stringify({ Statement: [{ Principal: { Service: "apigateway.amazonaws.com" }, Condition: { ArnLike: { "AWS:SourceArn": arn } } }] });
  expect(apiGatewaySourcesOf(policy(executeApiSourceArn(R, "a1", { kind: "method", method: "GET", path: "/items/{id}" }))))
    .toEqual([{ apiId: "a1", stage: "*", method: "GET", path: "/items/{id}" }]);
});
it("makes valid, distinct statement ids", () => {
  const id = (path: string) => permissionStatementId("a1", { kind: "method", method: "GET", path });
  expect(id("/items/{id}")).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
  expect(id("/items/{id}")).not.toBe(id("/items"));
  expect(id(`/${"x".repeat(200)}`)).toHaveLength(100);
});
it("maps identity sources both ways", () => {
  expect(identitySources(API_TYPES.rest, "header", ["Authorization"])).toEqual(["method.request.header.Authorization"]);
  expect(identitySources(API_TYPES.http, "header", ["a", "b"])).toEqual(["$request.header.a", "$request.header.b"]);
  expect(identitySources(API_TYPES.websocket, "querystring", ["token"])).toEqual(["route.request.querystring.token"]);
  expect(identityNamesOf("method.request.header.A, method.request.header.B")).toEqual({ kind: "header", names: ["A", "B"] });
  expect(identityNamesOf("route.request.querystring.token")).toEqual({ kind: "querystring", names: ["token"] });
});
it("reads the function back from either Lambda URI form", () => {
  const fn = `arn:aws:lambda:${R}:000000000000:function:f`;
  expect(functionArnOfUri(lambdaInvocationUri(R, fn))).toBe(fn);
  expect(functionArnOfUri(fn)).toBe(fn);
  expect(functionArnOfUri(`arn:aws:apigateway:${R}:sqs:path/000000000000/q`)).toBeUndefined();
});
it("turns the authorization choice into API fields", () => {
  const authorizers = [{ id: "t", type: "TOKEN" }, { id: "c", type: "COGNITO_USER_POOLS" }, { id: "j", type: "JWT" }] as AuthorizerRow[];
  expect(authorizationOf("NONE", authorizers)).toEqual({ authorizationType: "NONE" });
  expect(authorizationOf("t", authorizers)).toEqual({ authorizationType: "CUSTOM", authorizerId: "t" });
  expect(authorizationOf("c", authorizers)).toEqual({ authorizationType: "COGNITO_USER_POOLS", authorizerId: "c" });
  expect(authorizationOf("j", authorizers)).toEqual({ authorizationType: "JWT", authorizerId: "j" });
});
```

`addPermission.test.ts` (client thật, `vi.spyOn(lambda, "send")` như `apis.test.ts`): `send` reject `Object.assign(new Error("exists"), { name: "ResourceConflictException" })` → resolve; reject lỗi khác → reject với lỗi đó; lần gọi gửi `AddPermissionCommand` có `Action: "lambda:InvokeFunction"`, `Principal: "apigateway.amazonaws.com"`, `SourceArn`, `StatementId`, `FunctionName` = ARN.

- [ ] **Step 2:** `npm test -w core -- test/services/apigateway/crudHelpers.test.ts test/services/lambda/addPermission.test.ts` → FAIL (chưa export).
- [ ] **Step 3:** Viết các hàm theo Interfaces.
- [ ] **Step 4:** Lệnh Step 2 → PASS; `npm run typecheck -w core && npm run lint -w core` sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): helpers for Lambda permissions, identity sources and authorization`

### Task 2: Schema form (luật spec mục 5)

**Files:**

- Create: `core/src/services/apigateway/schemas.ts` (export qua `index.ts`)
- Test: `core/test/services/apigateway/schemas.test.ts`

**Interfaces — Produces** (form type = `z.input`, giá trị gửi đi = `z.output`; ô chọn "không có" là chuỗi rỗng; mọi tên được `trim`):

- `apiSchema` — `{ type: ApiType; name: string; description: string; functionArn: string; grant: boolean; routeSelection: string }` → `ApiForm`, `ApiValues`. Tên 1–128; WebSocket bắt buộc `routeSelection`. Form sửa API dùng lại schema này (type khóa, `functionArn: ""`).
- `resourceSchema(siblings: readonly string[])` — `{ pathPart }` → `ResourceForm`. Hợp lệ: `[A-Za-z0-9._-]+`, `{tên}`, `{tên+}` (tên `[A-Za-z0-9._-]+`); trùng anh em → `A resource /<pathPart> already exists.`
- `methodSchema` — `{ httpMethod: string; integration: "lambda" | "http" | "other"; functionArn: string; grant: boolean; url: string; authorization: string }` → `MethodForm`, `MethodValues`. `lambda` cần `functionArn` (`Choose a function.`); `http` cần URL bắt đầu `http://` / `https://` (`Enter a URL that starts with http:// or https://.`); `httpMethod` thuộc `METHOD_ORDER`.
- `routeSchema(apiType: ApiType, existingKeys: readonly string[])` — input `{ method: string; path: string; isDefault: boolean; routeKey: string; integration; functionArn; grant; url; authorization: string; twoWay: boolean }`; output thay `method` / `path` / `isDefault` bằng `routeKey` đã ghép → `RouteForm`, `RouteValues`. HTTP: `$default` hoặc `<METHOD> <path>`, path khớp `^/$|^(/([A-Za-z0-9._-]+|\{[A-Za-z0-9._-]+\}))*(/\{[A-Za-z0-9._-]+\+\})?$`. WebSocket: `routeKey` 1–128, integration chỉ `lambda`. Trùng `existingKeys` → `Route <key> already exists.` (khi sửa, caller bỏ key hiện tại khỏi danh sách)
- `authorizerSchema(apiType: ApiType, existingNames: readonly string[])` — `{ name; type: string; functionArn; grant; poolId; issuer; audience: string; identityKind: IdentityKind; identityNames: string }` → `AuthorizerForm`, `AuthorizerValues` (output `identityNames: string[]`, `audience: string[]` tách theo `,`). Tên 1–128, không trùng. Lambda (`TOKEN`, `REQUEST`) cần `functionArn`; `COGNITO_USER_POOLS` cần `poolId`; `JWT` cần `issuer` parse được bằng `URL.canParse`. Header `[A-Za-z0-9-]+`, query string `[A-Za-z0-9._-]+`; ít nhất một tên; `TOKEN` / `COGNITO_USER_POOLS` / `JWT` đúng một tên.
- `stageSchema(apiType: ApiType, existingNames: readonly string[])` — `{ name }` → `StageForm`. `[A-Za-z0-9_-]{1,128}`; HTTP nhận thêm `$default`; trùng → `Stage <name> already exists.`

- [ ] **Step 1: Viết test lỗi** (helper `firstMessage` như `eventbridge/schemas.test.ts`), mỗi `it` một luật:
  - `resourceSchema([])` nhận `items`, `{id}`, `{proxy+}`; từ chối `a b`, `{}`, `{a+}x`, `a/b`; `resourceSchema(["items"])` với `items` → `A resource /items already exists.`
  - `methodSchema`: `lambda` không function → `Choose a function.`; `http` với `ftp://x` → lỗi URL; `other` không cần gì.
  - `routeSchema(HTTP, [])`: `GET /items/{id}` → `routeKey: "GET /items/{id}"`; `ANY /{proxy+}` ok; `isDefault` → `$default`; `GET items` lỗi; `GET /{proxy+}/x` lỗi; `routeSchema(HTTP, ["GET /items"])` với `GET /items` → `Route GET /items already exists.`; `routeSchema(WebSocket, [])` nhận `sendMessage`, `$connect`; WebSocket với `integration: "http"` lỗi.
  - `authorizerSchema(REST, ["auth"])`: tên trùng lỗi; `TOKEN` hai header lỗi; `COGNITO_USER_POOLS` thiếu pool lỗi; `REQUEST` `A, B` → `identityNames: ["A","B"]`; header `a b` lỗi. `authorizerSchema(HTTP, [])`: `JWT` issuer `not a url` lỗi, audience `x, y` → `["x","y"]`.
  - `stageSchema(REST, ["prod"])`: `prod` → `Stage prod already exists.`; `$default` lỗi ở REST, nhận ở HTTP; `a.b` lỗi.
  - `apiSchema`: WebSocket thiếu route selection lỗi; tên 129 ký tự lỗi.
- [ ] **Step 2:** `npm test -w core -- test/services/apigateway/schemas.test.ts` → FAIL.
- [ ] **Step 3:** Viết `schemas.ts` (theo cách `eventbridge/schemas.ts`: `superRefine` + `addIssue` với `path`).
- [ ] **Step 4:** Step 2 → PASS; typecheck / lint core sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): form schemas for APIs, resources, methods, routes, authorizers and stages`

### Task 3: API + stage: operation, facade có thêm quyền, IT

**Files:**

- Modify: `core/src/services/apigateway/operations/apis.ts` (`createApi`, `updateApi`; `getApi` trả thêm `description`), `apis.ts` (`ApiDetail.description?: string`)
- Create: `core/src/services/apigateway/operations/stages.ts`
- Modify: `core/src/services/apigateway/service.ts`, `web/src/services/apigateway/hooks/useApiGatewayService.ts`
- Test: `core/test/services/apigateway/service.test.ts` (mới), `tests/it/apigateway-crud.test.ts` (mới)

**Interfaces:**

- Consumes: Task 1 (`executeApiSourceArn`, `permissionStatementId`, `addPermission`), Task 2 (`ApiValues`)
- Produces:
  - `createApi(v1, v2, values: ApiValues): Promise<ApiRef>` — REST `CreateRestApi`; HTTP có function: `CreateApi` với `Target` = ARN (Floci tạo route + stage `$default`, 7 #20); HTTP không function: `CreateApi` + `CreateStage { StageName: "$default", AutoDeploy: true }`; WebSocket: `CreateApi` với `RouteSelectionExpression`
  - `updateApi(v1, v2, api: ApiRef, values: Pick<ApiValues, "name" | "description" | "routeSelection">): Promise<void>` — REST patch `replace /name`, `/description`; v2 `UpdateApi` (Name, Description, RouteSelectionExpression chỉ WebSocket)
  - `createStage(v1, v2, api: ApiRef, name: string, autoDeploy: boolean): Promise<void>` — REST `CreateDeployment { stageName }`; v2 `CreateStage { AutoDeploy }`; `deleteStage(v1, v2, api: ApiRef, name: string): Promise<void>`
  - `interface ApiGatewayDeps { v2: ApiGatewayV2Client; lambda: LambdaClient; region: string }`
  - Facade: `createApi(values): Promise<{ api: ApiRef; failures: string[] }>`, `updateApi(api, values)`, `createStage(api, name, autoDeploy)`, `deleteStage(api, name)`. Helper nội bộ `grantInvoke(apiId, functionArn, target: PermissionTarget): Promise<string[]>` — lỗi → `[\`Couldn't grant permission: ${errorMessage(error)}\`]`, không ném. Mọi hàm Task 4–6 có ô grant dùng helper này và trả `{ failures: string[] }`.

- [ ] **Step 1: Unit test lỗi** (`service.test.ts`, client thật, `vi.spyOn(...).send`):
  - `createApi reports a failed grant without failing`: v2 `send` trả `{ ApiId: "h1" }`, lambda `send` reject → `{ api: { version: "v2", apiId: "h1" }, failures: [expect.stringMatching(/^Couldn't grant permission: /)] }`.
  - `createApi skips the grant when the box is off`: lambda `send` không được gọi.
- [ ] **Step 2: IT lỗi** (`tests/it/apigateway-crud.test.ts`; facade dựng như sau; `createFunction` chép từ `apigateway-integrations.test.ts`; `afterAll` xóa API / function đã tạo):

```ts
import { createApiGatewayService } from "../../core/src/services/apigateway/service.ts";
const apigw = createApiGatewayService(new APIGatewayClient(config), { v2: new ApiGatewayV2Client(config), lambda, region });
const invoke = (apiId: string, stage: string, path: string, init?: RequestInit) =>
  fetch(`${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, stage, path, "")}`, init);
```

  - `an HTTP API created with a Lambda answers from it and shows in the function policy`: `createApi({ type: "HTTP", functionArn, grant: true, … })` → `failures: []`; `invoke(apiId, "$default", "/anything")` 200 với body của function; `apiGatewaySourcesOf(policy)` chứa `{ apiId, stage: "*", method: "$default", path: "" }`.
  - `granting twice keeps one statement`: gọi `addPermission` (Task 1) hai lần cùng `statementId` → không ném, policy có đúng một statement với SourceArn đó.
  - `an HTTP API without a Lambda gets an auto-deploying $default stage`: `listStages` có `$default`.
  - `a REST API answers Stage not found until a stage is created`: `invoke` trước → body chứa `Stage not found`; `createStage(api, "dev", false)` → `listStages` có `dev`, `invoke(…,"dev","/")` body không chứa `Stage not found`; `deleteStage` → `listStages` không còn.
  - `updateApi renames REST and HTTP APIs and changes the WebSocket route selection`: `getApi` đọc lại `name`, `description`, `routeSelection`.
  - `createStage and deleteStage work on a WebSocket API`.
- [ ] **Step 3:** Chạy unit + IT → FAIL.
- [ ] **Step 4:** Viết operation + facade. Sửa `web/src/services/apigateway/hooks/useApiGatewayService.ts` để typecheck web qua: thêm `useAwsClient(LambdaClient)`, `region` từ `useLoadedConfig()`.
- [ ] **Step 5:** Unit + IT → PASS; `npm run typecheck && npm run lint` sạch. Floci khác survey → ghi ruling.
- [ ] **Step 6:** Commit gợi ý: `feat(apigateway): create, rename APIs and manage stages in core`

### Task 4: REST resource + method

**Files:**

- Create: `core/src/services/apigateway/operations/resources.ts`
- Modify: `core/src/services/apigateway/service.ts`
- Test: `tests/it/apigateway-crud.test.ts`

**Interfaces:**

- Consumes: Task 1 (`lambdaInvocationUri`), Task 2 (`MethodValues`), Task 3 (`grantInvoke`). Web tự gọi `authorizationOf` nên facade nhận sẵn `Authorization`.
- Produces:
  - `type Authorization = { authorizationType: string; authorizerId?: string }`
  - `createResource(v1, apiId: string, parentId: string, pathPart: string): Promise<void>`; `deleteResource(v1, apiId, resourceId): Promise<void>`
  - `saveMethod(v1, region, apiId: string, resourceId: string, values: MethodValues, authorization: Authorization, isNew: boolean): Promise<void>` — mới: `PutMethod` + `PutIntegration`; sửa: `PutIntegration` ghi đè (bỏ qua khi `integration === "other"`) + `UpdateMethod` patch `replace /authorizationType` và `replace /authorizerId` khi có. Lambda: `AWS_PROXY`, `integrationHttpMethod: "POST"`, `uri: lambdaInvocationUri(...)`; HTTP: `HTTP_PROXY`, `integrationHttpMethod` = `values.httpMethod`, `uri: values.url`
  - `deleteMethod(v1, apiId, resourceId, httpMethod): Promise<void>`
  - Facade: `createResource(apiId, parentId, pathPart)`, `deleteResource(apiId, resourceId)`, `saveMethod(apiId, resource: { id: string; path: string }, values, authorization, isNew): Promise<{ failures: string[] }>` (grant khi `integration === "lambda" && grant`, target `{ kind: "method", method: values.httpMethod, path: resource.path }`), `deleteMethod(apiId, resourceId, httpMethod)`

- [ ] **Step 1: IT lỗi** (REST API + stage `test` tạo bằng facade Task 3):
  - `a Lambda proxy method on /items/{id} answers and is granted`: `createResource` `items`, rồi `{id}`; `saveMethod` GET Lambda, grant → `invoke(…,"/items/42")` 200 body function; policy có `{ method: "GET", path: "/items/{id}" }`.
  - `ANY on {proxy+} proxies to an HTTP backend`: `HTTP_PROXY` `http://console:3701/api/{proxy}` → `invoke(…,"/health")` 200 (7 #28).
  - `editing a method switches to another function`: `saveMethod(…, isNew: false)` sang function 2 → body function 2.
  - `saving an AWS integration method keeps its integration`: method `AWS` tạo bằng SDK (như `restApiWith`), `saveMethod` với `integration: "other"`, `authorization: { authorizationType: "AWS_IAM" }` → `GetMethod` có `authorizationType: "AWS_IAM"`, `methodIntegration.uri` không đổi.
  - `deleteMethod and deleteResource remove them`: `listResources` không còn method / resource.
- [ ] **Step 2:** IT → FAIL.
- [ ] **Step 3:** Viết operation + facade.
- [ ] **Step 4:** IT → PASS; typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create and edit REST resources and methods in core`

### Task 5: Route HTTP / WebSocket

**Files:**

- Create: `core/src/services/apigateway/operations/routes.ts`
- Modify: `core/src/services/apigateway/routeRows.ts` (`RouteRow` thêm `id: string`, `integrationId?: string`, `twoWay: boolean` = có `RouteResponseSelectionExpression`), `operations/apiDetail.ts`, `service.ts`
- Test: `core/test/services/apigateway/routes.test.ts` (mới), `core/test/services/apigateway/routeRows.test.ts`, `tests/it/apigateway-crud.test.ts`

**Interfaces:**

- Consumes: Task 2 (`RouteValues`), Task 3 (`grantInvoke`), Task 4 (`Authorization`)
- Produces:
  - `createRoute(v2, apiId: string, apiType: ApiType, values: RouteValues, authorization: Authorization): Promise<void>` — `CreateIntegration` (HTTP Lambda: `AWS_PROXY`, `IntegrationUri` = ARN, `PayloadFormatVersion: "2.0"`; HTTP proxy: `HTTP_PROXY`, `IntegrationMethod: "ANY"`, `PayloadFormatVersion: "1.0"`; WebSocket: `AWS_PROXY`, `IntegrationUri` = ARN) + `CreateRoute { Target: "integrations/<id>" }`; `twoWay` (WebSocket) → `RouteResponseSelectionExpression: "$default"` + `CreateRouteResponse { RouteResponseKey: "$default" }`
  - `updateRoute(v2, apiId, apiType, routeId: string, values: RouteValues, authorization: Authorization): Promise<void>` — `GetRoute` + `GetRoutes`; đích đổi (type / URI khác, `integration !== "other"`): integration chỉ route này dùng → `UpdateIntegration`, dùng chung → `CreateIntegration` mới + `Target` mới; `UpdateRoute` (RouteKey, AuthorizationType, AuthorizerId, Target). WebSocket `twoWay` bật → thêm như lúc tạo; tắt → `DeleteRouteResponse` mọi route response + `UpdateRoute { RouteResponseSelectionExpression: "" }`
  - `deleteRoute(v2, apiId, routeId): Promise<void>` — `GetRoute`, `DeleteRoute`, rồi `DeleteIntegration` nếu không route nào còn `Target` tới integration đó
  - Facade: `createRoute(apiId, apiType, values, authorization)`, `updateRoute(apiId, apiType, routeId, values, authorization)` → `{ failures }` (grant target `{ kind: "route", routeKey: values.routeKey }`), `deleteRoute(apiId, routeId)`

- [ ] **Step 1: Unit test lỗi** (`routes.test.ts`, spy `send` trả theo `command.constructor.name`, ghi lại lệnh đã gửi):
  - `updateRoute edits the integration in place when only this route uses it` → có `UpdateIntegrationCommand`, không có `CreateIntegrationCommand`.
  - `updateRoute gives the route a new integration when another route shares it` → `CreateIntegrationCommand` rồi `UpdateRouteCommand` có `Target` mới; không `UpdateIntegrationCommand`.
  - `deleteRoute deletes an integration no route uses any more` / `keeps an integration another route still uses`.
  - `routeRows.test.ts`: `joinRoutes` trả `id`, `integrationId`, `twoWay`.
- [ ] **Step 2: IT lỗi:**
  - `an HTTP route to a Lambda answers and is granted`: HTTP API tạo không function (đã có stage `$default`), route `GET /items/{id}` → `invoke(apiId, "$default", "/items/7")` 200; policy `{ method: "GET", path: "/items/{id}" }`.
  - `changing the route key moves the route`: key mới 200, key cũ 404.
  - `switching a route to HTTP proxy calls the backend`: `http://console:3701/api/health` → 200.
  - `deleting a route deletes its integration`: `GetIntegrations` rỗng.
  - `a two-way WebSocket $default route replies to the client`: route `$default` `twoWay: true`, function trả `{ statusCode: 200, body: "pong" }`; client `WebSocket` (cách `apigateway.test.ts` "the WebSocket URL connects") gửi message → nhận `pong`. Tắt `twoWay` → không nhận gì trong `WS_WAIT_MS`.
- [ ] **Step 3:** Unit + IT → FAIL.
- [ ] **Step 4:** Viết operation + facade; sửa `RoutesTab.tsx` `trackBy='id'`.
- [ ] **Step 5:** Unit + IT → PASS; typecheck / lint sạch.
- [ ] **Step 6:** Commit gợi ý: `feat(apigateway): create, edit and delete HTTP and WebSocket routes in core`

### Task 6: Authorizer

**Files:**

- Create: `core/src/services/apigateway/operations/authorizers.ts`
- Modify: `apis.ts` (`AuthorizerRow.audience?: string[]`), `operations/apiDetail.ts`, `service.ts`
- Test: `tests/it/apigateway-crud.test.ts`

**Interfaces:**

- Consumes: Task 1 (`identitySources`, `cognitoPoolArn`, `lambdaInvocationUri`), Task 2 (`AuthorizerValues`), Task 3 (`grantInvoke`)
- Produces:
  - `createAuthorizer(v1, v2, region, api: ApiRef, apiType: ApiType, values: AuthorizerValues): Promise<string>` (trả authorizer ID) — REST: `CreateAuthorizer { type, authorizerUri (Lambda), providerARNs: [cognitoPoolArn] (Cognito), identitySource: sources.join(",") }`; HTTP: `AuthorizerType` `REQUEST` (`AuthorizerPayloadFormatVersion: "2.0"`, `EnableSimpleResponses: true`) hoặc `JWT` (`JwtConfiguration { Issuer, Audience }`); WebSocket: `REQUEST`
  - `updateAuthorizer(v1, v2, region, api, apiType, current: AuthorizerRow, values): Promise<void>` — REST patch `replace /name`, `/identitySource`, `/authorizerUri`; Cognito đổi pool: ruling 10; v2 `UpdateAuthorizer` cùng trường
  - `deleteAuthorizer(v1, v2, api, authorizerId): Promise<void>` — lỗi Floci ném nguyên văn
  - Facade: `createAuthorizer(api, apiType, values)`, `updateAuthorizer(api, apiType, current, values)` → `{ failures }` (grant cho `TOKEN` / `REQUEST` khi `grant`, target `{ kind: "authorizer", authorizerId }`), `deleteAuthorizer(api, authorizerId)`

- [ ] **Step 1: IT lỗi** (function authorizer chép từ `apigateway-integrations.test.ts` "Lambda REQUEST authorizer"):
  - `a TOKEN authorizer on a method blocks calls without a token`: `createAuthorizer` REST TOKEN header `Authorization`; `saveMethod` với `authorization: { authorizationType: "CUSTOM", authorizerId }` → thiếu token 401, token `allow` 200; về `NONE` → 200 không token. Policy có `{ stage: "authorizers", method: authorizerId, path: "" }`.
  - `a Cognito authorizer can be created and renamed`: pool tạo bằng SDK Cognito; `listAuthorizers` đọc lại `providerArns`, tên mới.
  - `an HTTP REQUEST authorizer on a route answers 403 / 200 from simple responses`.
  - `a JWT authorizer keeps issuer and audience`: `listAuthorizers` có `issuer`, `audience`.
  - `deleteAuthorizer removes it`.
- [ ] **Step 2:** IT → FAIL.
- [ ] **Step 3:** Viết operation + facade.
- [ ] **Step 4:** IT → PASS (toàn file `apigateway-crud.test.ts` và `apigateway*.test.ts` cũ); typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create, edit and delete authorizers in core`

### Task 7: Web — Create API, Edit API

**Files:**

- Create: `.superpowers/sdd/2026-11-27-apigateway-crud/e2e.sh` (chép `.superpowers/sdd/2026-11-27-core/e2e.sh`, đổi `L` sang thư mục này)
- Modify: `core/src/services/apigateway/paths.ts` (`APIGATEWAY_ROUTE_PATTERNS.create = "apis/create"`, `apigatewayRoutes.create`), `web/src/services/apigateway/index.tsx`, `hooks/useApis.ts`, `pages/ApiList.tsx`, `pages/ApiDetail.tsx`
- Create: `web/src/services/apigateway/pages/CreateApi.tsx`, `components/EditApiModal.tsx`, `components/LambdaFunctionFields.tsx`
- Test: `tests/e2e/apigateway-crud.spec.ts` (mới)

**Interfaces:**

- Consumes: Task 2 (`apiSchema`), Task 3 (facade)
- Produces:
  - `LambdaFunctionFields<T>({ control, functionName, grantName, label, optional?: boolean })` — `FormSelect` từ `useFunctions()` (value = ARN, label = tên, `empty='No functions'`) + `FormCheckbox` ô quyền (câu chữ Global Constraints); ô quyền chỉ hiện khi đã chọn function. Task 9–11 dùng lại.
  - `useCreateApi()`, `useUpdateApi(version, apiId)` trong `useApis.ts` (ruling 9)
  - Mutation có grant: `notifyBulkOutcome({ success, errorHeader, then })` (ruling 3)

- [ ] **Step 1:** Tạo `e2e.sh`. Viết E2E lỗi:
  - `creates an HTTP API with a Lambda, calls it, and Lambda › Triggers lists it`: `/apigateway/apis` → `Create API` → chọn `HTTP`, tên, function (tạo sẵn bằng SDK), ô quyền bật → `Create API` → URL `/apigateway/v2/<id>`, tab Routes có `$default`; `request.get(CONSOLE_URL + testInvokeUrl(AWS_PROXY_PATH, id, "$default", "/x", ""))` 200; `lambdaRoutes.function(fn, FUNCTION_TABS.triggers)` có link tên API.
  - `creates REST and WebSocket APIs`: REST → tab Resources có `/`; WebSocket → header có `Route selection: $request.body.action`.
  - `edits an API name`: header `Edit` → đổi tên → `Save` → heading tên mới.
- [ ] **Step 2:** `e2e.sh create e2e/apigateway-crud.spec.ts` → FAIL.
- [ ] **Step 3:** Viết trang (theo `kinesis/pages/CreateStream.tsx`: Type bằng `FormTiles` REST / HTTP / WebSocket, mặc định HTTP; Description chỉ REST / HTTP; Lambda chỉ HTTP, tùy chọn; Route selection chỉ WebSocket, mặc định `$request.body.action`), route trong `index.tsx`, nút `Create API` (primary) ở `ApiList`, `Edit` trước `Delete` ở header `ApiDetail`, `EditApiModal` (`FormModal`, `Save`).
- [ ] **Step 4:** E2E → PASS; `npm run typecheck && npm run lint` sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): Create API page and Edit API`

### Task 8: Web — tab Stages

**Files:** Modify `web/src/services/apigateway/components/StagesTab.tsx`, `hooks/useApiDetail.ts`; Create `components/StageModals.tsx`; Test `tests/e2e/apigateway-crud.spec.ts`

**Interfaces:** Consumes Task 2 (`stageSchema`), Task 3 (`createStage`, `deleteStage`). Produces `useCreateStage(version, apiId)`, `useDeleteStage(version, apiId)`.

- [ ] **Step 1: E2E lỗi** `creates and deletes a stage`: REST API (SDK) → tab Stages → `Create stage` → `dev` → hàng `dev`; tạo lại `dev` → lỗi `Stage dev already exists.`; chọn `dev` → `Delete` → xác nhận → hết hàng.
- [ ] **Step 2:** E2E → FAIL.
- [ ] **Step 3:** Bảng có `selectionType='single'`; header `[Delete] [Create stage]`; Create: `FormModal` một ô `Stage name`, `autoDeploy = type === HTTP`; Delete: `ConfirmModal` không gõ chữ.
- [ ] **Step 4:** E2E → PASS; typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create and delete stages`

### Task 9: Web — tab Resources

**Files:** Modify `components/ResourcesTab.tsx`, `hooks/useApiDetail.ts`; Create `components/ResourceModals.tsx`, `components/MethodModal.tsx`; Test `tests/e2e/apigateway-crud.spec.ts`

**Interfaces:** Consumes Task 1 (`authorizationOf`, `functionArnOfUri`, `describeIntegration`), Task 2 (`resourceSchema`, `methodSchema`), Task 4 (facade), Task 7 (`LambdaFunctionFields`). Produces `useCreateResource`, `useDeleteResource`, `useSaveMethod`, `useDeleteMethod` (tham số `apiId`).

- [ ] **Step 1: E2E lỗi:**
  - `builds a REST API from the console and tests it`: Create API REST (UI) → tab Resources → `Create resource` `items` → chọn `/items` → `Create method` GET, Lambda fn1, quyền bật → tab Stages `Create stage` `test` → Resources → chọn `GET` → tab Test → `Test` → `Status 200`, body fn1.
  - `edits a method to another function`: `Edit` → fn2 → `Save` → Test → body fn2.
  - `locks Delete on a resource with children and Create resource under {proxy+}`: `/items` có `/{id}` → `Delete` khóa; chọn `{proxy+}` → `Create resource` khóa.
  - `locks the integration of a CDK-made AWS integration`: method `AWS` (SDK) → `Edit` → thấy `Edit this integration in your IaC: …`, ô Function không có.
  - `deletes a method and a resource`.
- [ ] **Step 2:** E2E → FAIL.
- [ ] **Step 3:** Cây: resource cũng là nút chọn (ruling 7). Header khung trái `[Create resource] [Create method]` (ruling 8). Khung phải: resource → `[Delete]` (lý do khóa Global Constraints); method → `[Edit] [Delete]` + `MethodOverview`. `MethodModal`: Method (`Select`, bỏ method đã có, khóa khi sửa), Integration (`FormRadioGroup` Lambda function / HTTP; integration khác → `Alert` câu khóa và ẩn ô), `LambdaFunctionFields`, URL, Authorization (`None`, `AWS IAM`, từng authorizer); submit gọi `authorizationOf`.
- [ ] **Step 4:** E2E → PASS (cả `apigateway.spec.ts`, `apigateway-integrations.spec.ts`); typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create, edit and delete REST resources and methods`

### Task 10: Web — tab Routes (HTTP, WebSocket)

**Files:** Modify `components/RoutesTab.tsx`, `hooks/useApiDetail.ts`, `pages/ApiDetail.tsx` (truyền `apiType`); Create `components/RouteModal.tsx`; Test `tests/e2e/apigateway-crud.spec.ts`

**Interfaces:** Consumes Task 2 (`routeSchema`), Task 5 (facade, `RouteRow.id`), Task 7 (`LambdaFunctionFields`). Produces `useCreateRoute`, `useUpdateRoute`, `useDeleteRoute` (tham số `apiId`).

- [ ] **Step 1: E2E lỗi:**
  - `creates, edits and deletes an HTTP route`: HTTP API (UI, không Lambda) → `Create route` `GET /items/{id}` fn1 → gọi `/items/7` 200; `Edit` → `GET /things/{id}` → `/things/7` 200, `/items/7` 404; trùng key → `Route … already exists.`; `Delete` → bảng rỗng.
  - `a two-way WebSocket route replies`: WebSocket API (UI) → `Create route` `$default` fn trả `pong`, ô two-way bật → `Create stage` `dev` → client `WebSocket` tới `webSocketUrl(...)` nhận `pong`.
- [ ] **Step 2:** E2E → FAIL.
- [ ] **Step 3:** Bảng `selectionType='single'`, header `[Edit] [Delete] [Create route]`. `RouteModal`: HTTP — Method `Select` (`METHOD_ORDER`) + Path, `☐ $default` khóa hai ô kia; WebSocket — ô Route key (gợi ý `$connect`, `$disconnect`, `$default` bằng `FormAutosuggest`), ô two-way (mặc định bật trừ `$connect` / `$disconnect`); Integration (WebSocket chỉ Lambda), Authorizer (ruling 6). Delete: `ConfirmModal` không gõ chữ.
- [ ] **Step 4:** E2E → PASS; typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create, edit and delete routes`

### Task 11: Web — tab Authorizers

**Files:** Modify `components/AuthorizersTab.tsx`, `hooks/useApiDetail.ts`; Create `components/AuthorizerModal.tsx`; Test `tests/e2e/apigateway-crud.spec.ts`

**Interfaces:** Consumes Task 1 (`identityNamesOf`, `cognitoPoolIdOfProviderArn`, `functionArnOfUri`), Task 2 (`authorizerSchema`), Task 6 (facade), Task 7 (`LambdaFunctionFields`), `useUserPools()` của Cognito. Produces `useCreateAuthorizer`, `useUpdateAuthorizer`, `useDeleteAuthorizer` (tham số `version`, `apiId`).

- [ ] **Step 1: E2E lỗi:**
  - `a TOKEN authorizer from the console guards a method`: REST API + method + stage (SDK) → tab Authorizers `Create authorizer` Lambda (TOKEN), fn authorizer → Resources `Edit` method, Authorization = authorizer → Test không header → `Status 401`; header `Authorization: allow` → `Status 200`.
  - `edits and deletes an authorizer`: `Edit` đổi tên → hàng tên mới; `Delete` → hết hàng.
  - `JWT form keeps the local issuer warning`: HTTP API → tạo JWT với issuer Cognito local → cột Target có cảnh báo (popover hiện có).
- [ ] **Step 2:** E2E → FAIL.
- [ ] **Step 3:** Bảng `selectionType='single'`, header `[Edit] [Delete] [Create authorizer]`. `AuthorizerModal`: Type theo bảng spec 3.7 (khóa khi sửa), Name, `LambdaFunctionFields` / pool (`Select` từ `useUserPools`) / Issuer + Audience, nguồn danh tính (Header; WebSocket thêm Query string), ô tên header (TOKEN / Cognito / JWT mặc định `Authorization`).
- [ ] **Step 4:** E2E → PASS; typecheck / lint sạch.
- [ ] **Step 5:** Commit gợi ý: `feat(apigateway): create, edit and delete authorizers`

### Task 12: Mobile, tài liệu, hồi quy

**Files:** Modify `tests/mobile/responsive.spec.ts` (thêm `apigateway/apis` vào danh sách trang `/create`), `docs/development.md` (Traps mới nếu IT / E2E tìm ra), `docs/superpowers/specs/2026-11-19-apigateway-design.md` (dòng "Tạo / sửa API…" ở Để sau → ghi "Làm ở spec 2026-11-27"), `docs/superpowers/roadmap.md`, `tests/REPORT.md` (kết quả mới nhất + mục API Gateway CRUD), `tests/README.md` (nếu liệt kê file test)

- [ ] **Step 1:** `npm run test:mobile -w tests` → trang `/apigateway/apis/create` vừa 320–1440 px. Modal ở 320 px: kiểm tay bằng Playwright MCP (Create method, Create route, Create authorizer), không cuộn ngang.
- [ ] **Step 2:** Hồi quy, đọc từng kết quả: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:it -w tests`, E2E toàn bộ qua `e2e.sh full` (không truyền spec), `npm run test:ui -w tests`, `npm run test:ux -w tests`, `npm run bundle -w tests` (first load không tăng; chunk API Gateway tăng ghi vào REPORT).
- [ ] **Step 3:** Cập nhật tài liệu.
- [ ] **Step 4:** Commit gợi ý: `docs(apigateway): CRUD results, mobile check and roadmap`
