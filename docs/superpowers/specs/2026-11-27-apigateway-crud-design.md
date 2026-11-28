# API Gateway — Tạo, sửa, xóa trên console (spec bổ sung)

> Ngày: 2026-11-27 · Trạng thái: đã duyệt 2026-11-27 · Bổ sung cho: [apigateway-design](2026-11-19-apigateway-design.md) (đã làm 2026-11-26) · [Roadmap](../roadmap.md): đợt 3

## 1. Mục tiêu và lý do

Spec gốc để "Tạo / sửa API, resource, route, integration bằng form" ở **Để sau** với lý do *"Đoán dev ít dùng: API tạo bằng CDK"*. Lý do đó trái với quy tắc user chốt 2026-11-26 (lúc làm ECS): **CRUD cơ bản của resource chính luôn làm nếu Floci hỗ trợ; không đẩy sang Để sau bằng phỏng đoán tần suất dùng**. Spec gốc duyệt trước quy tắc này và chưa rà lại. User chốt làm bổ sung 2026-11-27.

Dev local dùng để:

- Dựng nhanh một API gọi Lambda khi chưa có (hoặc không muốn chạy) CDK: tạo API, thêm route / method trỏ tới function, tạo stage, rồi gọi qua invoke URL hoặc tab Test có sẵn.
- Sửa tại chỗ một API đã deploy: đổi function đích, gắn / gỡ authorizer, thêm route để thử.
- Từ Lambda › Triggers thấy được API vừa tạo (nhờ quyền gọi function, mục 4).

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`, như phần đã làm. **Server không phải sửa gì.** Logic gọi AWS nằm ở `core/` (facade `ApiGatewayService`), theo [spec tách core](2026-11-27-core-design.md); MCP sẽ dùng lại.

## 2. Phạm vi

Nguyên tắc chọn như spec gốc mục 2 (tiêu chí (1) dev thường dùng, (2) nối service khác, (3) Floci hỗ trợ toàn phần / một phần), cộng quy tắc CRUD ở trên. Floci: khảo sát 2026-11-27, mục 7.

### Làm

| Nhóm | Tính năng | Tiêu chí | Floci 2.4.0 |
| --- | --- | --- | --- |
| API | Tạo REST / HTTP / WebSocket; đổi tên, mô tả (WebSocket: route selection expression); xóa (đã có) | CRUD | Toàn phần (7 #19) |
| HTTP: tạo nhanh | Tạo HTTP API kèm một Lambda → route `$default` + stage `$default` tự deploy (giống "Add integration" của AWS console) | (1), (2) | Toàn phần (7 #20) |
| REST: resource | Tạo resource con (kể cả `{id}`, `{proxy+}`); xóa resource **không có resource con** | CRUD | Một phần: xóa cha để lại con mồ côi (7 #21) |
| REST: method | Tạo / sửa / xóa method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, ANY): integration **Lambda proxy** hoặc **HTTP proxy**; authorization NONE / AWS_IAM / authorizer | CRUD, (2) | Toàn phần (7 #22) |
| HTTP: route | Tạo / sửa / xóa route (`GET /items/{id}`, `ANY /{proxy+}`, `$default`): integration Lambda hoặc HTTP proxy; authorizer | CRUD, (2) | Toàn phần (7 #23) |
| WebSocket: route | Tạo / sửa / xóa route (`$connect`, `$disconnect`, `$default`, route tự đặt) tới Lambda; bật "trả lời client" (two-way) | CRUD, (2) | Toàn phần (7 #24; Traps) |
| Authorizer | Tạo / sửa / xóa: REST Lambda TOKEN / REQUEST, Cognito user pool; HTTP Lambda REQUEST, JWT; WebSocket Lambda REQUEST | CRUD, (2) | Toàn phần; JWT + Cognito local → 401 (spec gốc 7 #14) |
| Stage | **Create stage** (REST: deploy vào stage mới), **Delete stage** — user chốt thêm lại 2026-11-27 | (1) | Toàn phần (7 #25) |
| Quyền gọi Lambda | Khi gắn Lambda (method, route, authorizer): tự thêm `lambda:AddPermission` cho `apigateway.amazonaws.com`, giống ô "Grant permission" của AWS console | (2) | Floci không kiểm (spec gốc 7 #12) nhưng giữ policy (7 #26) |

### Để sau

| Tính năng | Ghi chú |
| --- | --- |
| Integration `AWS` tới SQS / SNS / DynamoDB / Step Functions / EventBridge | Phải viết mapping template VTL; Floci chạy (spec gốc 7 #6) nhưng form phức tạp. Hiện đã xem / gọi thử được API tạo bằng CDK |
| Integration Mock (REST) | Phải tạo method / integration response kèm template; đoán dev ít dùng ở local |
| API key, usage plan, `apiKeyRequired` | Chưa có màn hình API key; bật `apiKeyRequired` mà không tạo được key thì method không gọi được |
| Import / export OpenAPI, custom domain, CORS (v2), stage variables, throttle, payload format version | Như spec gốc |
| Sửa method / integration response, request parameter mapping | Thuộc integration `AWS` / Mock |

### Không làm

| Tính năng | Lý do |
| --- | --- |
| Nút **Deploy** lại vào stage có sẵn | Floci không chụp snapshot: sửa gì cũng chạy ngay trên mọi stage (spec gốc 7 #3, 7 #25). Chỉ cần **Create stage** một lần |
| Xóa cả cây resource con một lần | Floci không tự xóa con (7 #21); xóa từng resource từ lá lên. Không viết logic xóa đệ quy (nguyên tắc: không bù chỗ Floci thiếu) |
| Gỡ quyền gọi Lambda khi xóa method / route / API | AWS console cũng không gỡ; Lambda › Triggers đã hiện API đã xóa dạng chữ (spec gốc 3.9) |

## 3. Màn hình

Theo quy tắc chung của các service (chỉ Cloudscape, form zod như các trang Create khác, khung hẹp hai tầng). Tạo API là **trang**; resource, method, route, authorizer, stage, sửa API là **modal** ngay trong tab (giống modal Add trigger của Lambda).

### 3.1 Danh sách API — thêm nút Create API

```text
APIs (3)                                              [↻] [Delete] [Create API]
```

### 3.2 Trang Create API — `/apigateway/create`

```text
Create API
Type           (•) HTTP   ( ) REST   ( ) WebSocket
Name           [orders-api          ]
Description    [                    ]           (REST, HTTP)
Lambda         [▼ get-orders        ]  (tùy chọn, chỉ HTTP)  ☑ Grant API Gateway permission to invoke the function
Route selection [$request.body.action]          (chỉ WebSocket)
                                                   [Cancel] [Create API]
```

- **HTTP** có chọn Lambda: `CreateApi` với `Target` = ARN function → Floci tạo route `$default`, integration, stage `$default` tự deploy (7 #20); thêm quyền (mục 4). Không chọn Lambda: `CreateApi` + `CreateStage $default` (`AutoDeploy: true`) để invoke URL chạy ngay khi thêm route.
- **REST**: `CreateRestApi` (tên, mô tả). Không tự tạo stage (giống AWS): tab Stages có **Create stage**; tab Test đã có "Create a stage to test this method."
- **WebSocket**: `CreateApi` với route selection expression (mặc định `$request.body.action`, như AWS console).
- Xong thì mở trang chi tiết API (tab mặc định). Tên lỗi validation: mục 5.

### 3.3 Header chi tiết API — thêm Edit

```text
orders-api                                                      [Edit] [Delete]
```

Modal **Edit API**: tên, mô tả (REST, HTTP); WebSocket thêm route selection expression. `UpdateRestApi` (patch `/name`, `/description`) / `UpdateApi`.

### 3.4 Tab Resources (REST)

```text
┌ Resources ─────────── [Create resource] ┐ ┌ GET /items/{id} ─────────── [Edit] [Delete] ┐
│ /                                       │ │ [Overview] [Test]                            │
│ ├─ /items          [Create method]      │ │ …                                            │
│ │   ├─ GET                              │ └──────────────────────────────────────────────┘
│ │   └─ /{id}                            │
```

- **Create resource** (dưới resource đang chọn, mặc định `/`): ô Path part. `{name}` = path param, `{name+}` = proxy (chỉ ở cuối). `CreateResource`.
- **Delete resource**: chỉ khi resource không có resource con và không phải `/`; có con thì nút khóa, mô tả "Delete its child resources first." (7 #21). Method của resource bị xóa theo.
- **Create method / Edit method** (modal, cùng form):

```text
Method          [▼ GET ]                      (khóa khi sửa)
Integration     (•) Lambda function  ( ) HTTP
Function        [▼ get-item   ]               ☑ Grant API Gateway permission to invoke the function
URL             [https://…   ]  Method [▼ GET]  (khi HTTP)
Authorization   [▼ None | AWS IAM | <authorizer> ]
```

Lambda → `PutIntegration` `AWS_PROXY` (URI `arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<arn>/invocations`). HTTP → `HTTP_PROXY`. Tạo: `PutMethod` + `PutIntegration`. Sửa: `PutIntegration` ghi đè (7 #22) và `UpdateMethod` (patch `/authorizationType`, `/authorizerId`). Integration hiện là loại khác (`AWS`, `MOCK`, do CDK tạo): form **khóa phần integration**, chỉ sửa authorization, mô tả "Edit this integration in your IaC: the console edits Lambda and HTTP proxy integrations." (giống cách EventBridge khóa target lạ).

- **Delete method**: `DeleteMethod`, xác nhận một bước (ConfirmModal không cần gõ chữ, giống xóa route).

### 3.5 Tab Routes (HTTP)

```text
Routes (4)                                   [Edit] [Delete] [Create route]
 ◯ Route                  Integration                 Authorizer
 ◯ GET /items             Lambda → list-items ↗       —
```

- **Create route / Edit route** (modal):

```text
Route           [▼ GET ] [/items/{id}      ]     hoặc ☐ $default
Integration     (•) Lambda function  ( ) HTTP
Function        [▼ …]   ☑ Grant API Gateway permission…
Authorizer      [▼ None | <authorizer> ]
```

Tạo: `CreateIntegration` (`AWS_PROXY`, payload 2.0; HTTP: `HTTP_PROXY`) + `CreateRoute` (`Target: integrations/<id>`). Sửa: đổi route key / authorizer bằng `UpdateRoute`; đổi đích bằng `UpdateIntegration` (integration chỉ route này dùng) hoặc tạo integration mới rồi `UpdateRoute` (integration dùng chung) (7 #23).

- **Delete route**: `DeleteRoute`, rồi `DeleteIntegration` nếu không còn route nào trỏ tới integration đó (console không có màn hình integration riêng, để lại thì thành rác không thấy được).

### 3.6 Tab Routes (WebSocket)

Như 3.5, với:

- Route key: `$connect`, `$disconnect`, `$default` hoặc tên tự đặt (giá trị mà route selection expression trả ra).
- Đích chỉ Lambda.
- ☑ **Send the function's response to the client** (mặc định bật cho route không phải `$connect` / `$disconnect`): đặt `RouteResponseSelectionExpression: "$default"` và tạo route response `$default`. Floci 2.4.0 chỉ trả lời client khi có hai thứ này (development.md › Traps).

### 3.7 Tab Authorizers

```text
Authorizers (2)                              [Edit] [Delete] [Create authorizer]
```

Modal **Create / Edit authorizer**:

| API | Loại | Ô |
| --- | --- | --- |
| REST | Lambda (TOKEN) | tên, function, header token (mặc định `Authorization`) → `method.request.header.<tên>` |
| REST | Lambda (REQUEST) | tên, function, header (một hoặc nhiều) |
| REST | Cognito user pool | tên, pool (chọn từ Cognito), header token |
| HTTP | Lambda (REQUEST) | tên, function, header → `$request.header.<tên>`, simple responses (bật, payload 2.0) |
| HTTP | JWT | tên, issuer, audience, header; popover có sẵn về issuer Cognito local (spec gốc 3.5) |
| WebSocket | Lambda (REQUEST) | tên, function, header hoặc query string |

- Lambda authorizer: thêm quyền với `SourceArn` `…:<apiId>/authorizers/<id>` (mục 4).
- Sửa: `UpdateAuthorizer` (tên, identity source, function / pool / issuer). Loại authorizer khóa khi sửa.
- **Delete**: `DeleteAuthorizer`; Floci trả lỗi gì thì hiện nguyên văn (không tự kiểm method / route đang dùng).

### 3.8 Tab Stages

```text
Stages (1)                                   [Delete] [Create stage]
```

- **Create stage** (modal: tên). REST: `CreateDeployment` với `stageName` (AWS console "Deploy to new stage"). HTTP / WebSocket: `CreateStage` (HTTP `AutoDeploy: true`).
- **Delete stage**: `DeleteStage`, xác nhận một bước.
- Mô tả có sẵn "Floci serves the latest configuration on every stage; deployments have no effect." giữ nguyên.

## 4. Quyền gọi Lambda

- Gắn Lambda ở method, route hoặc authorizer (tạo hoặc đổi function) với ô **Grant API Gateway permission to invoke the function** đang bật (mặc định): `AddPermission` `lambda:InvokeFunction`, principal `apigateway.amazonaws.com`, `SourceArn`:
  - REST method: `arn:aws:execute-api:<region>:<account>:<apiId>/*/<METHOD>/<path không có "/" đầu>` (`ANY` → `*`).
  - HTTP / WebSocket route: `…/<apiId>/*/<METHOD>/<path>` hoặc `…/<apiId>/*/$default`, `…/<apiId>/*/<routeKey>` (WebSocket).
  - Authorizer: `…/<apiId>/authorizers/<id>`.
  - `StatementId` đặt từ API ID + method / route / authorizer (giới hạn ký tự của Lambda), để gắn lại cùng chỗ không bị trùng: statement trùng ID thì bỏ qua lỗi `ResourceConflictException`.
- Lý do khác các service khác (EventBridge, Cognito, Logs không thêm quyền vì Floci không kiểm): Lambda › Triggers tìm nguồn API Gateway **bằng chính policy này** (spec gốc 3.9). Không thêm thì API tạo trên console không hiện ở Lambda.
- Mô tả dưới ô: "Floci doesn't check this permission; Lambda › Triggers uses it to show this API."
- Thêm quyền lỗi: method / route vẫn được tạo, báo "Created, but couldn't grant permission: …" (không rollback).

## 5. Validation (luật AWS)

| Ô | Luật |
| --- | --- |
| Tên API | 1–128 ký tự |
| Path part (REST) | `[A-Za-z0-9._-]+`, hoặc `{tên}`, hoặc `{tên+}` (chỉ ở resource lá); không trùng resource con khác cùng cha |
| Route key (HTTP) | `$default`, hoặc `<METHOD> /<path>` với METHOD thuộc GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, ANY; path bắt đầu `/`, đoạn `{tên}` / `{tên+}` (cuối); không trùng route có sẵn |
| Route key (WebSocket) | `$connect`, `$disconnect`, `$default` hoặc 1–128 ký tự; không trùng |
| Tên stage | REST: `[A-Za-z0-9_-]{1,128}`; HTTP: thêm `$default`; không trùng |
| Tên authorizer | 1–128 ký tự, không trùng trong API |
| URL HTTP proxy | `http://` hoặc `https://` |
| Header | tên header hợp lệ (`[A-Za-z0-9-]+`) |

Floci nhận cả giá trị AWS từ chối: form tự chặn (cách các service khác đang làm).

## 6. Kỹ thuật

- **core** (`core/src/services/apigateway/`): thêm operation `createApi`, `updateApi`, `createResource`, `deleteResource`, `putMethod` (method + integration), `updateMethodAuthorization`, `deleteMethod`, `createRoute`, `updateRoute`, `deleteRoute` (kèm integration không còn dùng), `createAuthorizer`, `updateAuthorizer`, `deleteAuthorizer`, `createStage`, `deleteStage`; facade `ApiGatewayService` có thêm hàm tương ứng. Schema zod của các form ở `core/src/services/apigateway/schemas.ts` (mới). Quyền Lambda: operation `addPermission(lambda: LambdaClient, …)` mới ở `core/src/services/lambda/operations/functions.ts` (cạnh `getPolicy`); facade API Gateway nhận thêm **client** Lambda (`createApiGatewayService(v1, { v2, lambda })`, `lambda: LambdaClient`, không phải `LambdaService` để khỏi kéo Logs / Secrets) và gọi `addPermission` sau khi tạo method / route / authorizer. Operation của API Gateway chỉ nhận client của chính nó.
- **web**: trang `CreateApi`; modal ở các tab; hook mutation làm mới đúng query của API (danh sách, chi tiết, resources / routes / authorizers / stages) và query triggers của Lambda khi thêm quyền.
- Chọn function: dùng `useFunctions` của Lambda (ARN + tên); chọn pool: `useUserPools` của Cognito.
- Không sửa server. Không package mới.

## 7. Khảo sát Floci 2.4.0 (2026-11-27)

Chạy qua proxy `/aws` của console, region `ap-southeast-1`, script tạm đã xóa, resource tạm đã dọn. Nối tiếp bảng mục 7 của spec gốc.

| # | Điểm | Kết quả |
| --- | --- | --- |
| 19 | Tạo / đổi tên / xóa API | REST `CreateRestApi`, `UpdateRestApi` (patch `/name`, `/description`), `DeleteRestApi` ✅; HTTP / WebSocket `CreateApi`, `UpdateApi` (Name, Description, RouteSelectionExpression), `DeleteApi` ✅ |
| 20 | HTTP tạo nhanh (`Target` = ARN Lambda) | ✅ Floci tạo route `$default` → integration mới, stage `$default` `AutoDeploy: true`; gọi `/restapis/{id}/$default/_user_request_/bất kỳ` → 200 từ Lambda |
| 21 | REST resource | `CreateResource` (`items`, `{id}`, `{proxy+}`) ✅. **`DeleteResource` cha không xóa con**: xóa `/items`, `GetResources` vẫn còn `/items/{id}` (AWS xóa cả cây) |
| 22 | REST method / integration | `PutMethod` (GET, ANY) + `PutIntegration` `AWS_PROXY` ✅; `HTTP_PROXY` tới `http://console:3701/api/health` ✅; `UpdateIntegration` patch `/uri` và `PutIntegration` ghi đè đều đổi đích ngay ✅; `UpdateMethod` patch `/authorizationType`, `/authorizerId` ✅ (gắn TOKEN authorizer → gọi thiếu token 401); `DeleteMethod` ✅. Resource / method mới gọi được ngay, không cần deploy lại |
| 23 | HTTP route / integration | `CreateIntegration` (`AWS_PROXY` 2.0, `HTTP_PROXY`) + `CreateRoute` ✅; `UpdateRoute` đổi `Target` → gọi ra function mới ✅; đổi `RouteKey` → key mới 200, key cũ 404 ✅; `UpdateIntegration` đổi URI ✅; `DeleteRoute` → 404 ✅; `DeleteIntegration` ✅. v2 không có stage vẫn gọi được (như spec gốc 7 #3) |
| 24 | WebSocket route | `CreateRoute` `$connect`, `$disconnect`, `$default`, `sendMessage` ✅; `UpdateApi` đổi route selection ✅; trả lời client cần route response (development.md › Traps) |
| 25 | Stage | REST chưa có stage → `404 {"message":"Stage not found"}`; `CreateDeployment` với `stageName` → 200; `CreateStage` từ deployment có sẵn ✅; `DeleteStage` ✅. HTTP `CreateStage $default AutoDeploy` ✅ |
| 26 | Authorizer | REST `CreateAuthorizer` TOKEN, `UpdateAuthorizer` (patch `/name`), `DeleteAuthorizer` ✅; HTTP `CreateAuthorizer` REQUEST (simple responses), gắn / gỡ bằng `UpdateRoute` (`AuthorizationType`, `AuthorizerId`), `UpdateAuthorizer`, `DeleteAuthorizer` ✅. Cognito / JWT: đã chạy ở IT (`it/apigateway*.test.ts`) |
| 27 | Quyền Lambda | `AddPermission` (principal `apigateway.amazonaws.com`, `SourceArn` execute-api) ✅, `RemovePermission` ✅ (policy rỗng → `GetPolicy` 404) |
| 28 | REST `ANY /{proxy+}` → `HTTP_PROXY` `http://console:3701/api/{proxy}` | Floci tự thay `{proxy}` bằng path gọi tới (`/health` → 200 từ `/api/health`), **có hay không có** `integration.request.path.proxy` mapping đều được. AWS cần mapping này (AWS console tự thêm) |

## 8. Kiểm thử

- **IT** (`tests/it/apigateway-crud.test.ts`): gọi operation của core qua proxy, import bằng đường dẫn tương đối (`../../core/src/...`) như `it/apigateway.test.ts` đang làm, không thêm dependency cho `tests`: tạo API ba loại; resource / method / route tới Lambda gọi được; đổi đích; gắn authorizer → 401; tạo stage REST → hết 404; xóa route xóa integration không còn dùng; quyền Lambda đọc lại được bằng `apiGatewaySourcesOf`.
- **E2E** (`tests/e2e/apigateway-crud.spec.ts`): qua UI: tạo HTTP API kèm Lambda → gọi invoke URL ra kết quả của function → Lambda › Triggers hiện API; tạo REST API → resource → method → Create stage → tab Test 200; sửa method sang function khác; tạo / xóa authorizer; xóa resource có con bị khóa; WebSocket route two-way trả lời client.
- **Unit** (core): schema form (luật mục 5), dựng `SourceArn` / `StatementId`, chọn cách đổi đích route (integration riêng / dùng chung).
- **Mobile**: trang Create API, modal ở 320 px.

## 9. Quyết định

| Quyết định | Lý do |
| --- | --- |
| Làm CRUD API, resource, method, route, authorizer, stage | Quy tắc CRUD (user, 2026-11-26); user chốt 2026-11-27 |
| Thêm lại **Create stage / Delete stage**; không có nút Deploy | REST cần stage mới gọi được; Floci không snapshot nên deploy lại không có tác dụng. User chốt 2026-11-27 |
| Integration Lambda proxy + HTTP proxy; `AWS` / Mock để sau | Đề xuất của Claude: hai loại dev dùng khi dựng API local; `AWS` cần template VTL |
| Tự thêm quyền gọi Lambda (ô mặc định bật) | Đề xuất của Claude: Lambda › Triggers dựa vào policy; giống AWS console |
| Xóa resource có con thì khóa, không xóa đệ quy | Đề xuất của Claude: Floci không xóa con; không viết logic bù (nguyên tắc spec) |
| HTTP API tạo mới luôn có stage `$default` tự deploy | Đề xuất của Claude: giống AWS console; invoke URL chạy ngay |
| Xóa route thì xóa integration không còn route nào dùng | Đề xuất của Claude: console không có màn hình integration, để lại thành rác không thấy |
| HTTP proxy trên resource `{proxy+}`: không tự thêm path mapping | Đề xuất của Claude: Floci chạy được không cần mapping (7 #28); request parameter mapping nằm ở Để sau |
| Facade nhận `LambdaClient`, không nhận `LambdaService` | Đề xuất của Claude: chỉ cần `AddPermission`; `LambdaService` kéo theo Logs, Secrets |

## 10. Để lại cho người làm

- Thứ tự nút trong header tab, chữ trên nút / mô tả (theo các service đã làm).
- Cách gom mutation và query key cho từng tab.
- StatementId cụ thể (miễn ổn định và hợp lệ với Lambda).
