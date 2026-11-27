# API Gateway — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã làm (2026-11-26; IT `it/apigateway.test.ts`, E2E `apigateway.spec.ts`, UI `ui/responsive.spec.ts`), duyệt 2026-11-19, cập nhật 2026-11-24 theo [rà soát](2026-11-24-apigateway-review-design.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 3

## 1. Mục tiêu

Làm màn hình API Gateway cho API mà CDK (hoặc SAM, Terraform) deploy lên Floci: REST API (v1), HTTP API và WebSocket API (v2) trên một trang. Dev local dùng để:

- Xem API có những route nào, mỗi route gọi tới đâu (Lambda, HTTP, service AWS), authorizer nào.
- Lấy **invoke URL** cho app.
- **Test** một method của REST API ngay trên console và xem response (giống tab Test của AWS), thay vì dựng curl.
- Từ route đi sang function Lambda, Cognito pool, stack CloudFormation.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Đối chiếu với [tài liệu API Gateway của Floci](https://floci.io/floci/services/api-gateway/) và đã chạy thử trên Floci 2.4.0 (mục 7). Tài liệu mô tả bản mới hơn 2.4.0, có nhiều chỗ 2.4.0 làm khác.

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác (tiêu chí quan trọng), **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Làm đơn giản: chỉ tính năng thường dùng, dùng thẳng những gì API của Floci trả, không viết thêm logic để bù chỗ Floci thiếu; mỗi tính năng phải có ích khi dev / test ở local.

### Làm trong đợt này

| Nhóm                     | Tính năng                                                                                                 | Tiêu chí | Floci 2.4.0                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| Danh sách API            | REST, HTTP, WebSocket trong một bảng (tên, type, ID, ngày tạo); tìm theo tên; xóa                         | (1)      | Toàn phần                                                                  |
| REST: Resources          | Cây resource → method; chi tiết method: integration, authorizer, API key required                         | (1), (2) | Toàn phần (`embed=methods`, một lần gọi)                                   |
| HTTP / WebSocket: Routes | Bảng route → integration, authorizer; WebSocket hiện route selection expression                           | (1), (2) | Toàn phần                                                                  |
| Integration              | Type + URI nguyên văn; Lambda thì link sang function                                                      | (2)      | Một phần: nhiều kiểu integration Floci không chạy (7 #6–#8)                |
| Authorizers              | Tên, type, identity source; link Lambda / Cognito pool khi có ARN / ID trực tiếp                          | (2)      | Một phần: JWT với issuer Cognito local bị chặn (7 #9, #14)                 |
| Stages                   | Tên stage, **invoke URL** cho máy dev và cho container trong compose (copy được), deployment, thời gian; WebSocket: WebSocket URL + @connections URL | (1)      | Một phần: Floci bỏ qua stage / deployment (7 #3)                           |
| **Test (REST)**          | Tab Test của method: path param, query, header, body → status, latency, body, header; link log Lambda     | (1), (2) | Một phần: không có `TestInvokeMethod`, gửi qua proxy `/aws` (7 #4)         |
| StackLink                | "Stack: X" trên trang chi tiết API                                                                        | (2)      | Toàn phần ([spec CloudFormation](2026-11-19-cloudformation-design.md) 3.8) |
| Lambda › Triggers        | Hiện nguồn **API Gateway** (chỉ xem): đọc `GetPolicy` của function, giống AWS                             | (2)      | Toàn phần: Floci giữ policy CDK tạo (7 #12)                                |

### Để sau

| Tính năng                                                      | Ghi chú                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nút Deploy, stage variables, throttle, log**                 | User chốt cắt 2026-11-19 vì không có ý nghĩa với UI hiện tại; **có thể thêm lại nếu đổi UI lúc làm**. Floci: Deploy không có tác dụng (7 #3), stage variables / throttle chỉ lưu, log không ghi (7 #10) |
| ~~Tạo / sửa API, resource, route, integration bằng form~~      | **Đã làm 2026-11-27** theo [apigateway-crud-design](2026-11-27-apigateway-crud-design.md) (quy tắc CRUD: không để sau bằng phỏng đoán)                                                                   |
| Import / export OpenAPI                                        | Đoán dev ít dùng                                                                                                                                                                                        |
| Custom domain, API key, usage plan                             | Đoán dev ít dùng                                                                                                                                                                                        |
| Test cho HTTP API, WebSocket                                   | AWS không có; WebSocket còn không qua được proxy `/aws` (7 #11)                                                                                                                                         |
| Đọc template VTL / subtype v2 để hiện đích SQS, SNS, DynamoDB… | Phải đoán bằng regex; hiện URI nguyên văn là đủ                                                                                                                                                         |

### Không làm

| Tính năng                                  | Lý do                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `TestInvokeMethod`, `TestInvokeAuthorizer` | Floci 2.4.0 `UnknownOperation`; tab Test gửi request thật thay thế |
| Bật env JWT cho Floci trong compose        | Với `FLOCI_HOSTNAME=localhost.floci.io` (compose hiện tại), bật `FLOCI_SECURITY_ALLOW_PRIVATE_JWT_TARGETS` vẫn 401; chỉ chạy khi `FLOCI_HOSTNAME=127.0.0.1`, mà đổi vậy thì SQS từ Lambda / app trong compose lại `ECONNREFUSED` (7 #9, #14) |
| Invoke URL dạng host `{id}.execute-api.localhost.floci.io:4566` | Chỉ chạy trên máy dev; trong container compose tên này ra `127.0.0.1` → `Connection refused` (7 #15). Dạng path chạy ở cả hai nơi |
| TCP                                        | API Gateway không có (AWS cũng vậy; TCP là Network Load Balancer)  |

### Liên kết với service khác

| Service | Kiểu liên kết | Floci 2.4.0 | Console hiện |
| --- | --- | --- | --- |
| Lambda | Integration proxy / non-proxy; authorizer TOKEN / REQUEST; resource policy | Chạy (7 #1, #9); Floci không kiểm policy (7 #12) | Link function (3.6, 3.5); Lambda › Triggers (3.9) |
| Cognito | v1 authorizer `COGNITO_USER_POOLS`; v2 JWT | v1 chạy; v2 issuer local → 401 (7 #9, #14) | Link pool (3.5); popover JWT |
| CloudFormation | Stack tạo `AWS::ApiGateway::RestApi`, `AWS::ApiGatewayV2::Api` | Chạy | `StackLink` + `resourceLinks.ts` (3.2, 6) |
| SQS, SNS, DynamoDB, Step Functions, EventBridge | v1 integration `AWS` | Chạy khi template đúng dạng (7 #6) | Type + URI nguyên văn, không link (3.6) |
| S3 | v1 integration `AWS` | **Không chạy** (7 #6) | URI nguyên văn; Test ra 500 |
| SQS, Kinesis… qua v2 `IntegrationSubtype` | v2 | **Không chạy** (7 #7) | Type + URI nguyên văn |
| CloudWatch Logs | Access / execution log | **Không ghi** (7 #10) | Chỉ link log Lambda (3.7) |
| IAM | Authorizer `AWS_IAM` | Chỉ kiểm chữ ký SigV4, không đánh giá policy (theo [tài liệu Floci](https://floci.io/floci/services/api-gateway/); gọi không ký trên 2.4.0 → 403, 7 #18) | Mô tả "Floci checks the signature, not IAM policies. Test sends unsigned requests." (3.3) |
| VPC link, CloudFront | Private integration; origin execute-api | Chưa kiểm | Không làm |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; thiếu giá trị là "—"; khung hẹp thì bảng thành hai tầng (`useIsCompact`); khối rỗng hoặc lỗi vẫn giữ khung. URI, ARN, URL dài: cho xuống dòng, không để trang cuộn ngang.

Sidebar: **APIs**.

### 3.1 Danh sách API — `/apigateway/apis`

```text
APIs (3)                                                         [↻] [Delete]
[🔍 Find APIs by name          ]
 ◯ Name ▲            Type        ID            Created
 ◯ orders-api        REST        a1b2c3d4e5    2026-11-19 09:12
 ◯ public-http       HTTP        k9l8m7n6o5    2026-11-19 09:30
 ◯ chat              WebSocket   w1x2y3z4a5    2026-11-19 10:02
```

- `GetRestApis` (v1) + `GetApis` (v2, `ProtocolType` HTTP / WEBSOCKET), gộp một bảng, vòng phân trang của từng API.
- Delete: chọn một API, `ConfirmModal` gõ `delete` → `DeleteRestApi` / `DeleteApi`.

### 3.2 Chi tiết API — `/apigateway/:version/:apiId`

`version`: `v1` (REST) hoặc `v2` (HTTP, WebSocket). Vd `/apigateway/v1/a1b2c3d4e5`. v1 và v2 là hai API khác nhau của AWS, cần biết gọi bên nào; HTTP hay WebSocket đọc từ `ProtocolType` của `GetApi`. Nhờ vậy CloudFormation dựng được link thẳng từ type + API ID (`AWS::ApiGateway::RestApi` → `v1`, `AWS::ApiGatewayV2::Api` → `v2`).

```text
orders-api                                                         [Delete]
REST · a1b2c3d4e5 · Created 2026-11-19 09:12          Stack: OrdersStack ↗
[Resources] [Authorizers] [Stages]
```

- REST: tab Resources, Authorizers, Stages. HTTP và WebSocket: tab Routes, Authorizers, Stages. Tab lưu trên URL (`?tab=`), mặc định tab đầu.
- `StackLink` trong description của header (type `AWS::ApiGateway::RestApi` / `AWS::ApiGatewayV2::Api`, physical ID = API ID).
- API không tồn tại: "API … not found" kèm link về danh sách.

### 3.3 Tab Resources (REST)

```text
┌ Resources ─────────────┐ ┌ GET /items/{id} ───────────────────────────────┐
│ /                      │ │ [Overview] [Test]                              │
│ ├─ /items              │ │ Integration   Lambda proxy → get-item ↗        │
│ │   ├─ GET             │ │ Authorizer    CognitoAuth (Cognito)            │
│ │   └─ POST            │ │ API key       Not required                     │
│ │   └─ /{id}           │ │ URI           arn:aws:apigateway:…:lambda:path…│
│ │       ├─ GET  ◀      │ └────────────────────────────────────────────────┘
│ │       └─ DELETE      │
│ └─ /health             │
│     └─ GET             │
└────────────────────────┘
```

- `GetResources` với `embed=methods`: một lần gọi có đủ resource, method và `methodIntegration` (7 #2).
- Cây bằng `TreeView` của Cloudscape. Chọn method thì hiện chi tiết bên phải; khung hẹp thì chi tiết xuống dưới.
- Chi tiết method có 2 tab, giống AWS (AWS có thêm Method / Integration request / response, ở đây gộp vào Overview):
  - **Overview:** Integration (3.6), Authorizer (tên từ tab Authorizers, hoặc `NONE` / `AWS_IAM`), API key (`apiKeyRequired`), URI. Authorizer `AWS_IAM`: thêm mô tả "Floci checks the signature, not IAM policies. Test sends unsigned requests." (7 #18; cùng cách các câu "Floci doesn't…" đang có, vd `sns/components/PublishSmsModal.tsx`).
  - **Test:** 3.7.

### 3.4 Tab Routes (HTTP, WebSocket)

```text
Routes (4)
 Route                  Integration                         Authorizer
 GET /items             Lambda → list-items ↗               —
 POST /items            Lambda → create-item ↗              JwtAuth
 ANY /proxy/{proxy+}    HTTP proxy → https://example.com    —
 $default               Lambda → fallback ↗                 —
```

- `GetRoutes` + `GetIntegrations` (ghép theo `target` = `integrations/<id>`) + `GetAuthorizers`.
- WebSocket: dòng mô tả "Route selection: `$request.body.action`" trên bảng; route `$connect`, `$disconnect`, `$default`, route tùy chỉnh.
- Không có Test (AWS cũng không có Test cho HTTP / WebSocket API).

### 3.5 Tab Authorizers

```text
Authorizers (3)
 Name          Type                 Identity source                   Target
 CognitoAuth   Cognito user pools   method.request.header.Authorization   ap-southeast-1_Ab12 ↗
 TokenAuth     Lambda (TOKEN)       method.request.header.Authorization   token-auth ↗
 JwtAuth       JWT                  $request.header.Authorization     issuer http://localhost.floci.io:4566/…  ⓘ
```

- v1 `GetAuthorizers`: `type` (TOKEN, REQUEST, COGNITO_USER_POOLS), `identitySource`, `authorizerUri` (Lambda → link function, cùng cách 3.6), `providerARNs` (Cognito → pool ID lấy sau `userpool/`, link `cognitoRoutes.pool(id)` — Cognito đã vào `main`).
- v2 `GetAuthorizers`: `AuthorizerType` (REQUEST, JWT), `IdentitySource`, `AuthorizerUri` hoặc `JwtConfiguration` (issuer, audience).
- JWT có issuer trỏ Floci local (host của `flociPublicUrl` / `flociInternalUrl`): popover "Floci blocks local Cognito issuers, so requests get 401. Use a Lambda or Cognito user pool authorizer on a REST API to test sign-in locally." (7 #9, #14).

### 3.6 Hiện integration

| Kiểu                                                                                                                            | Hiện                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Lambda (v1 `AWS_PROXY` / `AWS` với URI `…:lambda:path/2015-03-31/functions/<arn>/invocations`; v2 `AWS_PROXY` với ARN function) | "Lambda proxy → <tên>" hoặc "Lambda → <tên>", link `lambdaRoutes.function(tên)`. ARN có `${stageVariables.…}` → text |
| `HTTP`, `HTTP_PROXY`                                                                                                            | "HTTP proxy → <URL>"                                                                                                 |
| `MOCK`                                                                                                                          | "Mock"                                                                                                               |
| `AWS` service khác (SQS, SNS, DynamoDB…)                                                                                        | "AWS → <service>" (đoạn `:<service>:` trong URI) + URI nguyên văn                                                    |
| v2 có `IntegrationSubtype`                                                                                                      | Floci 2.4.0 không lưu subtype (7 #7): hiện type + URI nguyên văn                                                     |

Hàm thuần `integration.ts` (parse URI → loại, tên function). Không đọc template VTL.

### 3.7 Tab Test của method (REST)

Giống tab Test của AWS:

```text
[Overview] [Test]
Path        id  [42        ]                 (một ô cho mỗi {param} của resource)
Query       [q=abc&limit=10                ]
Headers     [Authorization:Bearer eyJ…      ]  (mỗi dòng Header:Value)
Body        { … }                              (ẩn với GET, HEAD)
                                                              [Test]
────────────────────────────────────────────────────────────────────
Status 200 · Latency 143 ms
Response body     { "id": "42", "name": "…" }
Response headers  content-type: application/json …
Lambda logs: get-item › Monitor ↗
```

- Method lấy từ method đang chọn. Path dựng từ resource path, thay `{param}` bằng giá trị đã nhập (`{proxy+}` nhận cả đoạn có `/`).
- AWS gọi `TestInvokeMethod` (không cần stage); Floci 2.4.0 không có API này (7 #13) → gửi bằng `fetch` tới `/aws/restapis/{apiId}/{stage}/_user_request_{path}?{query}` qua proxy `/aws` (7 #4), với `stage` là stage đầu tiên của API (Floci chạy cấu hình mới nhất trên mọi stage, 7 #3). API chưa có stage: nút Test khóa, mô tả "Create a stage to test this method."
- Body: `CodeEditor`. Response body: JSON parse được thì format, không thì text (`CodeSnippet`).
- Status, latency (đo ở trình duyệt), response headers, nguyên văn kể cả lỗi (vd 502 body rỗng khi Lambda lỗi, 500 với integration Floci không hỗ trợ, 7 #5–#8).
- AWS hiện log thực thi của API Gateway; Floci không ghi log đó (7 #10) → thay bằng link "Lambda logs: <tên> › Monitor" khi integration là Lambda.

### 3.8 Tab Stages

```text
Stages (1)
 Name   Invoke URL                                                                    Deployment   Updated
 dev    From your machine            http://localhost:4566/restapis/a1b2c3d4e5/dev/_user_request_/           ⧉   x9y8z7   09:12
        From a container in compose  http://localhost.floci.io:4566/restapis/a1b2c3d4e5/dev/_user_request_/  ⧉
```

- v1 / v2 `GetStages`.
- **Invoke URL**, 2 dòng giống các trang đang có (SNS `sns/components/DetailsTab.tsx`, SQS `SettingsTab.tsx`): "From your machine" = `${flociPublicUrl}/restapis/{id}/{stage}/_user_request_/`, "From a container in compose" = `${flociInternalUrl}/restapis/{id}/{stage}/_user_request_/` (cả hai từ `useLoadedConfig()`), cho REST và HTTP. Đã chạy cả hai nơi (7 #15). Không dùng dạng host (2 Không làm) và không dùng `apiEndpoint` của v2 (Floci trả `https://{id}.execute-api.{region}.amazonaws.com`, 7 #3). `FLOCI_TLS_ENABLED=true` không cần đổi gì: Floci nghe HTTP và HTTPS cùng cổng (7 #16).
- WebSocket, giống AWS hiện 2 URL: **WebSocket URL** `ws://{id}.execute-api.{region}.localhost:4566/{stage}` (dạng duy nhất chạy trên 2.4.0, 7 #11) và **@connections URL** `${flociPublicUrl}/execute-api/{id}/{stage}/@connections`.
- Mô tả dưới header bảng: "Floci serves the latest configuration on every stage; deployments have no effect." (7 #3).

### 3.9 Thay đổi ở Lambda › tab Triggers

```text
Triggers (3)
 Source        Resource            Details
 SQS           orders-queue ↗      Batch size 10
 API Gateway   orders-api ↗        GET /items/{id}
 API Gateway   public-http ↗       POST /items
```

- Gộp vào trang Lambda đang có (Lambda đã ổn định, không mở spec riêng; user chốt 2026-11-19).
- `GetPolicy` của function → statement có `Principal.Service = apigateway.amazonaws.com` → `Condition.ArnLike["AWS:SourceArn"]` dạng `arn:aws:execute-api:<region>:<acct>:<apiId>/<stage>/<METHOD>/<path>` → API ID (link sang API) và method + path (Details). Tên API lấy từ danh sách API (3.1). Function không có policy (Floci trả 404 `ResourceNotFoundException`) → không có dòng nào, không báo lỗi.
- Chỉ xem: không bật/tắt, không xóa ở đây — thêm `apigateway: "API Gateway"` vào `DISPLAY_ONLY_SOURCES` và `"apigateway"` vào `VIEW_ONLY_SOURCES` (`lambda/constants.ts`), giống EventBridge, Cognito. Thêm `listApiGatewayTriggers` vào `Promise.all` của `useTriggers` (`lambda/hooks/useTriggers.ts`), cùng cách `listCognitoTriggers`. Chỉ 1 lần `GetPolicy` cho function đang mở (+ danh sách API), không quét mọi function. Link sang API cần biết `v1` / `v2`: tra API ID trong danh sách API.
- API không dùng `AddPermission` (Floci không bắt buộc) thì không hiện — giống AWS.
- Permission của Lambda authorizer (CDK tự thêm) có `SourceArn` dạng `arn:aws:execute-api:<region>:<acct>:<apiId>/authorizers/<authorizerId>` → vẫn là một dòng của API đó, Details "Authorizer <authorizerId>" (không phải method + path).

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                        | Gọi                                                       |
| ------------------------------- | --------------------------------------------------------- |
| Danh sách                       | `GetRestApis` + `GetApis`                                 |
| REST Resources                  | `GetResources` (`embed=methods`)                          |
| HTTP / WS Routes                | `GetRoutes` + `GetIntegrations` + `GetAuthorizers`        |
| Authorizers                     | `GetAuthorizers` (v1 / v2)                                |
| Stages                          | `GetStages` (v1 / v2) + `/api/config` (URL)               |
| Test (REST)                     | `fetch` `/aws/restapis/{id}/{stage}/_user_request_{path}` |
| Lambda › Triggers (API Gateway) | `GetPolicy` của function + danh sách API                  |
| Xóa                             | `DeleteRestApi` / `DeleteApi`                             |

---

## 5. Trạng thái và lỗi

| Tình huống                                    | Hiển thị                                         |
| --------------------------------------------- | ------------------------------------------------ |
| API không có                                  | "API … not found" kèm link về danh sách          |
| Test lỗi (5xx, 4xx, mạng)                     | Status và body nguyên văn                        |
| Integration Floci không chạy (v2 subtype, S3) | Hiện như mọi integration; Test ra 500 nguyên văn |
| JWT authorizer với issuer local               | Popover ở tab Authorizers (3.5)                  |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-api-gateway @aws-sdk/client-apigatewayv2 -w web --min-release-age=7
```

`tests/` khi viết integration test: cùng lệnh với `-w tests`.

### Cấu trúc thư mục

```bash
web/src/services/apigateway/
├── index.tsx, routes.ts, constants.ts
├── integration.ts             # parse URI integration → loại, tên function (3.6)
├── invokeUrl.ts               # dựng invoke URL, WebSocket URL, URL của Test (3.7, 3.8)
├── hooks/
│   ├── useApiGateway.ts       # client v1 + v2 qua /aws
│   ├── useApis.ts             # list, delete
│   └── useApiDetail.ts        # resources, routes, integrations, authorizers, stages
├── pages/                     # ApiList, ApiDetail
└── components/                # ResourcesTab, MethodTest, RoutesTab, AuthorizersTab, StagesTab
```

Khai báo trong `registry.ts` như các service khác (trang tải bằng `lazyPage`, `navigation` có 1 mục); icon `web/public/icons/apigateway.svg`. Thêm `AWS::ApiGateway::RestApi` (→ `v1`) và `AWS::ApiGatewayV2::Api` (→ `v2`) vào `LINK_BUILDERS` trong `resourceLinks.ts` của CloudFormation (đã có trên `main`).

### Dùng lại từ phần đã có

| Thành phần                                                            | Dùng cho                     |
| --------------------------------------------------------------------- | ---------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`                          | Header bảng, xóa             |
| `CodeEditor`, `CodeSnippet`, `CopyButton`                             | Body request / response, URL |
| `lambdaRoutes`, `cognitoRoutes`                                       | Link function, Cognito pool  |
| `useLoadedConfig` (`flociPublicUrl`, `flociInternalUrl`)              | Invoke URL 2 dòng (3.8)      |
| `StackLink` (CloudFormation)                                          | Header chi tiết API          |
| `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify` | Trạng thái, thông báo        |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1` (2 lượt khảo sát + kiểm WebSocket và policy). Resource tạm đã xóa, kiểm còn 0. #14–#17 chạy thêm ngày 2026-11-24 trên container Floci tạm (cấu hình như `docker-compose.yml`), đã xóa.

| #   | Rủi ro                                       | Kết quả                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Lambda proxy, path param, `{proxy+}`**     | **Ổn** cả v1 và v2 (payload 2.0 và 1.0); MOCK (v1), HTTP / HTTP_PROXY ổn                                                                                                                                                                                                                                                               |
| 2   | **Đọc cấu trúc REST**                        | `GET /restapis/{id}/resources?embed=methods` trả đủ resource, method, `methodIntegration` một lần. `GetIntegration` v1 trả `httpMethod: null`                                                                                                                                                                                          |
| 3   | **Stage / deployment / endpoint**            | v1: stage không có → 404; nhưng không chụp snapshot (resource mới gọi được ngay, chưa deploy). v2: bỏ qua stage hoàn toàn (stage lạ vẫn 200). `apiEndpoint` v2 là địa chỉ AWS thật                                                                                                                                                     |
| 4   | **Gọi thử qua proxy `/aws`**                 | **Ổn** (chạy server console thật): `/aws/restapis/{id}/{stage}/_user_request_/…` cho cả v1 và v2, POST body JSON, header `Authorization` đi qua; `Sec-Fetch-Site: cross-site` → 403 đúng `localOnly`. Gọi thẳng `localhost:4566` từ trình duyệt bị CORS chặn. Dạng URL theo host không qua proxy được                                  |
| 5   | **Lambda lỗi**                               | 502 body rỗng (AWS: "Internal server error"); function không có → 404                                                                                                                                                                                                                                                                  |
| 6   | **v1 integration `AWS`**                     | SQS (dạng `path` + template form; dạng `action` chỉ với template JSON), SNS (template JSON), DynamoDB, Step Functions, EventBridge, Lambda non-proxy: **dữ liệu tới đích**. **S3 không chạy**. Querystring mapping không chuyển cho service; `selectionPattern` so với cả body lỗi; VTL thiếu `$foreach.*`                             |
| 7   | **v2 `IntegrationSubtype`**                  | **Không chạy**: không lưu subtype, gọi → 500                                                                                                                                                                                                                                                                                           |
| 8   | **v2 request parameter mapping**             | Header / querystring / path chạy; `$request.body.x` không; Lambda AWS_PROXY bỏ qua mapping                                                                                                                                                                                                                                             |
| 9   | **Authorizer**                               | Lambda TOKEN / REQUEST ✅; v1 Cognito ✅ (idToken); v2 JWT với issuer Cognito local → 401 (chặn `http://localhost`); chạy được khi bật **cả** `FLOCI_SECURITY_ALLOW_PRIVATE_JWT_TARGETS=true` và `FLOCI_HOSTNAME=127.0.0.1` — đổi mọi URL Floci trả về. Với hostname hiện tại xem #14 |
| 10  | **Log, throttle, quota**                     | Access / execution log không ghi; quota, throttle không áp dụng; API key bắt buộc thì vẫn chặn đúng (403)                                                                                                                                                                                                                              |
| 11  | **WebSocket**                                | **Chạy**: `ws://{id}.execute-api.{region}.localhost:4566/{stage}` → 101; `$connect` / message / `$disconnect` gọi Lambda; route response trả tin; `@connections` POST đẩy tin xuống client, GET có thông tin. Dạng `ws://localhost:4566/ws/{id}/{stage}` → 403. Tin rơi về `$default` nhưng `routeKey` là giá trị selection expression |
| 12  | **Không cần `lambda:AddPermission`**         | API gọi Lambda được dù không có permission. `GetPolicy` của Lambda vẫn giữ statement `apigateway.amazonaws.com` khi có (dùng cho Lambda › Triggers, 3.9)                                                                                                                                                                               |
| 13  | **TestInvokeMethod / Authorizer, export v2** | `UnknownOperation`                                                                                                                                                                                                                                                                                                                     |
| 14  | **JWT v2 với `FLOCI_HOSTNAME=localhost.floci.io`** | Issuer Cognito có dạng `http://localhost.floci.io:4566/<poolId>`. Có alias network, không flag → 401. Có alias + `FLOCI_SECURITY_ALLOW_PRIVATE_JWT_TARGETS=true` → **401**. Không alias (tên ra `127.0.0.1`) + flag → 401. Chỉ `FLOCI_HOSTNAME=127.0.0.1` + flag → 200. Kết luận: 1 env không đủ với compose hiện tại |
| 15  | **Invoke URL trong compose**                 | Dạng path `${flociInternalUrl}/restapis/{id}/{stage}/_user_request_/…` từ một container trong network compose → 200; từ máy dev qua `flociPublicUrl` → 200. Dạng host `{id}.execute-api.localhost.floci.io:4566`: máy dev 200, trong container tên ra `127.0.0.1` → `Connection refused` |
| 16  | **`FLOCI_TLS_ENABLED=true`**                 | Floci chạy "HTTPS + HTTP dual mode" trên 4566; URL `http://` vẫn 200 → giữ scheme của `flociPublicUrl` / `flociInternalUrl` |
| 17  | **`apiEndpoint` v2 trên compose hiện tại**   | Vẫn `https://{id}.execute-api.ap-southeast-1.amazonaws.com` (như #3) |
| 18  | **`AWS_IAM` gọi không ký**                   | Chạy 2026-11-27 trên Floci 2.4.0 (`ap-southeast-1`): REST method `AWS_IAM` + MOCK, stage `dev`, `fetch` không ký tới `http://localhost:4566/restapis/{id}/dev/_user_request_/probe` → **403** `{"message":"Missing Authentication Token"}`, header `x-amzn-errortype: MissingAuthenticationTokenException`; qua proxy `/aws` của console cũng 403. Đối chứng: method `NONE` cùng API → 200. Tab Test gửi không ký nên method `AWS_IAM` luôn 403. Chưa kiểm: ký bằng user không có quyền. API tạm `lc-e2e-iam-*` đã xóa |

**Chưa kiểm, kiểm khi làm:** SDK v3 (`client-api-gateway`, `client-apigatewayv2`) qua proxy `/aws` (REST JSON như Lambda, đã chạy qua proxy); authorizer `AWS_IAM` ký với user không có quyền → ? (gọi không ký → 403, đã kiểm ở 7 #18).

**Đã kiểm thêm:** `tree-view` có trong Cloudscape đang cài (3.0.1407). Gọi `_user_request_` không cần header SigV4 vẫn tìm đúng API ở region `ap-southeast-1` (khác SQS peek).

---

## 8. Thứ tự làm

1. User cài package (mục 6). Icon, khai báo trong `registry.ts`, `useApiGateway`.
2. Hàm thuần + unit test: `integration.ts`, `invokeUrl.ts`.
3. Danh sách API (v1 + v2), xóa.
4. Chi tiết: REST Resources, HTTP / WebSocket Routes, Authorizers, Stages.
5. Tab Test của method REST, link log Lambda.
6. `StackLink` và dòng trong `resourceLinks.ts` (CloudFormation đã có trên `main`).
7. Lambda › Triggers: nguồn API Gateway từ `GetPolicy` (3.9).
8. Test: integration `tests/it/apigateway.test.ts` (REST + HTTP → Lambda, gọi qua `/aws`, stages); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; API `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: deploy (CDK hoặc API) một REST API có Lambda proxy + Cognito authorizer, một HTTP API có route `$default`, một WebSocket API → danh sách thấy cả 3 → REST: cây resource, chọn method thấy Lambda (link), tab Test nhập path param → 200, link log Lambda → bỏ header Authorization → 401 → HTTP: bảng route → WebSocket: routes, copy WebSocket URL, `wscat` kết nối được → Stages: copy invoke URL, gọi bằng curl → Lambda › Triggers thấy nguồn API Gateway → xóa API.

---

## 9. Quyết định

| Quyết định                                                                                                                | Lý do                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| REST, HTTP, WebSocket trên một trang                                                                                      | Khảo sát 2026-11-19; giống AWS Console                                                                                                          |
| Chỉ làm tính năng thường dùng, dùng thẳng dữ liệu Floci trả                                                               | User chốt 2026-11-19                                                                                                                            |
| Cắt nút Deploy, stage variables, throttle, log — **có thể thêm lại nếu đổi UI**                                           | Không có ý nghĩa với UI hiện tại; Floci không áp dụng. User chốt 2026-11-19                                                                     |
| Lambda › Triggers hiện nguồn API Gateway, làm trong spec này                                                              | Đọc policy giống AWS; Lambda đã ổn định nên gộp vào đây thay vì việc riêng. User chốt 2026-11-19                                                |
| Không bật env JWT trong compose; chỉ popover                                                                              | Chạy thử 2026-11-24: với `localhost.floci.io` bật flag vẫn 401; chỉ chạy khi `FLOCI_HOSTNAME=127.0.0.1`, mà vậy thì app trong compose hỏng (7 #14). Big Boss chốt option C 2026-11-24 |
| Integration hiện type + URI nguyên văn, chỉ link Lambda                                                                   | Không đoán đích từ VTL / subtype                                                                                                                |
| Test: tab Test trong method REST, giống AWS (ô riêng cho path param, query, header, body); HTTP / WebSocket không có Test | User chốt 2026-11-19: AWS làm thế nào thì làm thế đó. Gửi qua `/aws/restapis/{id}/{stage}/_user_request_…` vì Floci không có `TestInvokeMethod` |
| Không có Test cho WebSocket                                                                                               | Proxy không chuyển tiếp được; phải sửa server                                                                                                   |
| Route chi tiết `/apigateway/:version/:apiId` (`v1` hoặc `v2`)                                                             | v1 và v2 là hai API khác nhau; CloudFormation link thẳng được. User duyệt 2026-11-19                                                            |
| Invoke URL 2 dòng (máy dev, container compose) dạng path, tự dựng từ `/api/config`; WebSocket hiện WebSocket URL + @connections URL | Floci trả sai `apiEndpoint`; app trong compose cần URL riêng, giống SNS / SQS. User chốt 2026-11-19, đổi thành 2 dòng 2026-11-24 (7 #15) |
| Không hiện invoke URL dạng host                                                                                           | Không chạy trong container compose (7 #15). Chốt 2026-11-24                                                                                     |
| Giữ Floci 2.4.0; nâng 2.5.0 là việc riêng, kèm khảo sát lại                                                               | Tài liệu floci.io mô tả 2.5.x; chạy thật trên 2.4.0 thắng. Nâng bản chạm mọi spec, Traps, test. Chốt 2026-11-24                                 |
| Không sửa server                                                                                                          | API Gateway là AWS API thuần; gọi thử đi qua proxy `/aws`                                                                                       |
