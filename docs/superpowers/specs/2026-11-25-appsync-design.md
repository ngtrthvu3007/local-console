# AppSync — Thiết kế

> Ngày: 2026-11-25 · Trạng thái: đã làm · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4

## 1. Mục tiêu

Màn hình AppSync cho dev local, theo roadmap: **xem schema, data source, resolver; chạy thử query; lấy endpoint GraphQL và API key**. User chốt hướng B (2026-11-25): làm đủ như AWS console những gì Floci 2.4.0 chạy được (mục 2), trừ phần Floci không hỗ trợ.

Dev dùng để:

- Xem API do CDK / Amplify tạo: schema, data source, resolver và code của nó, stack nào tạo.
- Chạy query / mutation thử trên endpoint local bằng API key, Cognito hoặc IAM, như app sẽ gọi.
- Sửa nhanh schema, resolver (VTL / JS), data source, pipeline function rồi chạy lại query, không cần deploy CDK lại.
- Lấy endpoint + API key cho frontend (thẻ Connect).

Mọi thao tác gọi thẳng Floci qua proxy `/aws`: control plane bằng `@aws-sdk/client-appsync`, query bằng `fetch` tới endpoint GraphQL qua proxy. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng, **hoặc** (2) nối với service khác, **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Không thêm bộ lọc riêng (user nhắc 2026-11-25).

### Làm trong đợt này

| Nhóm           | Tính năng                                                                                    | Tiêu chí | Floci 2.4.0                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Danh sách      | API: tên, ID, kiểu auth mặc định, endpoint; xóa                                              | (1)      | Toàn phần                                                                                                           |
| Tạo API        | Tên, kiểu auth (API key / Cognito user pool / IAM); auth API key thì tạo luôn một API key    | (1)      | Toàn phần                                                                                                           |
| Schema         | Xem, sửa SDL; lưu bất đồng bộ, báo lỗi                                                       | (1)      | Toàn phần; số dòng trong lỗi lệch (7 #3)                                                                            |
| Resolver       | Danh sách theo type / field; tạo, sửa, xóa resolver unit / pipeline, runtime JS hoặc VTL     | (1) (2)  | Một phần: Lambda direct resolver nhận event rỗng (7 #6); code không kiểm khi lưu (7 #7)                             |
| Data source    | NONE, DynamoDB (chọn bảng), Lambda (chọn function); tạo, sửa, xóa; link sang bảng / function | (2)      | Một phần: Lambda chỉ chạy qua template Invoke (7 #6); xóa data source đang dùng vẫn được (console chặn, 7 #8)       |
| Function       | Pipeline function: tạo, sửa, xóa; resolver nào dùng                                          | (2)      | Một phần: `ListResolversByFunction` luôn rỗng (console tự dò, 7 #8); xóa function đang dùng vẫn được (console chặn) |
| Queries        | Chạy query / mutation với variables; auth API key / Cognito (đăng nhập user) / IAM           | (1) (2)  | Một phần: Cognito phải gửi `Bearer <token>` (7 #10); subscription không chạy (7 #11)                                |
| Settings       | Đổi tên, auth mặc định + auth phụ; API key: tạo (hạn 1–365 ngày), xóa                        | (1)      | Toàn phần; key dưới 1 ngày bị từ chối (7 #9)                                                                        |
| Connect        | Endpoint GraphQL + API key, code mẫu gọi query (Node.js, Python)                             | (1)      | Toàn phần                                                                                                           |
| CloudFormation | `StackLink` trên trang API; link từ resource của stack                                       | (2)      | Toàn phần (7 #12)                                                                                                   |
| Nối Cognito    | API auth Cognito link sang user pool; tab Queries đăng nhập bằng user của pool               | (2)      | Toàn phần                                                                                                           |

### Để sau

| Tính năng                                                                 | Lý do                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Trang bảng DynamoDB / function Lambda liệt kê data source AppSync dùng nó | AWS console không có; phải quét `ListDataSources` của mọi API. User chốt không làm (2026-11-25): tiết kiệm công |
| Lưu nhiều query đặt tên (như saved events của Lambda)                     | (đoán) dev chạy lại một vài query; đợt này chỉ nhớ query gần nhất của mỗi API (3.6)                             |
| Data source RDS (RELATIONAL_DATABASE)                                     | Tạo được; chưa kiểm query chạy thật trên DB container                                                           |

### Không làm

| Tính năng                                                        | Lý do                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| Subscription / endpoint realtime (WebSocket)                     | Floci không có đường realtime (7 #11)                  |
| Test resolver (EvaluateCode / EvaluateMappingTemplate)           | Floci trả 404 (7 #13): thử resolver bằng tab Queries   |
| Data source HTTP                                                 | Tạo được nhưng query lỗi `UnsupportedOperation` (7 #6) |
| Lambda direct resolver (không template)                          | Function nhận event rỗng (7 #6): form luôn kèm code    |
| Caching, Merged API, Event API (v2), custom domain, logging, WAF | Floci 404 hoặc rỗng; không có tác dụng ở local         |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: nhóm **Application integration** (cùng màu icon AWS của AppSync), mục **APIs**. Icon Tabler `IconGraph` (gợi GraphQL).

### 3.1 APIs — `/appsync/apis`

```text
APIs (2)                                                       [↻] [Actions ▾] [Create API]
[🔍 Find APIs by name or ID                   ]
 ◯ Name          API ID                       Authorization      GraphQL endpoint
 ◯ todo-api      c94d9045a1b2…                API key            http://localhost:4566/v1/apis/c94d…/graphql ⧉
 ◯ shop-api      14eac84f…                    Cognito user pool  http://localhost:4566/v1/apis/14ea…/graphql ⧉
```

- `ListGraphqlApis` (vòng `nextToken`). Tìm ở client theo tên, ID. Sắp theo tên.
- **GraphQL endpoint** dựng từ `flociPublicUrl` + path của `uris.GRAPHQL` (Floci trả host `localhost.floci.io`, mục 4), `copyable`.
- **Actions**: Delete (`ConfirmModal` gõ `delete`): "Deletes the schema, data sources, resolvers, functions and API keys." Rỗng: `EmptyState` "No APIs" — "Create an API, or deploy one with CDK, then refresh." kèm nút Create API.
- Khung hẹp: cột Name có tầng 2 là ID và kiểu auth (như `InstanceList`).

### 3.2 Chi tiết API — `/appsync/apis/:apiId?tab=`

```text
todo-api (c94d9045a1b2…)                                       [↻] [Actions ▾]
API key · Stack: TodoStack ↗
[Schema] [Data sources] [Functions] [Queries] [Settings]
```

- `GetGraphqlApi`. Tab trên URL (`?tab=`), mặc định Schema không ghi lên URL (như EC2, CloudFront). Không có: "API … not found" kèm link về danh sách (`pageState`).
- Header Actions: Delete (như 3.1, xong về danh sách).

**Tab Schema**, hai khối:

```text
Schema                                              [Save schema]
  [ code editor, ngôn ngữ graphqlschema                          ]
Resolvers (5)                        [Type: All ▾]   [Actions ▾] [Attach resolver]
 ◯ Type       Field        Resolver                   Runtime
 ◯ Query      getTodo      todos-table                JS
 ◯ Query      listTodos    —
 ◯ Mutation   addTodo      Pipeline (2 functions)     JS
```

- Schema: `GetIntrospectionSchema format=SDL` (Floci trả SDL đúng như lúc lưu, 7 #2). API tạo ngoài console chưa có schema: 404 coi là "chưa có schema", editor hiện schema mẫu chưa lưu (trình duyệt vẫn ghi 404: Traps). **Save schema**: `StartSchemaCreation` (base64) rồi hỏi `GetSchemaCreationStatus` mỗi giây tới khi `SUCCESS` / `FAILED` (tối đa 30 giây). `FAILED`: `Alert` lỗi liệt kê `message` của từng lỗi (bỏ phần `[@dòng:cột]` vì lệch, 7 #3); schema cũ vẫn chạy. Có thay đổi chưa lưu thì nút Save sáng và rời tab hỏi lại (như tab Code của Lambda).
- Resolvers: type và field lấy từ SDL đã lưu bằng `graphql` (`buildSchema`, kèm khai báo scalar / directive riêng của AppSync, mục 4) vì `ListTypes` của Floci luôn rỗng (7 #2). Mỗi object type một lần `ListResolvers`. Một dòng cho mỗi field của Query, Mutation và các type có resolver; field không có resolver hiện "—". Resolver có trên field không còn trong schema (Floci nhận, 7 #7) vẫn hiện, kèm "(not in schema)".
- Cột Resolver: tên data source (unit) hoặc "Pipeline (n functions)"; Runtime: JS / VTL.
- Actions: Edit (mở 3.4), Delete (`ConfirmModal` thường). **Attach resolver** khi chọn dòng chưa có resolver (mở 3.4 với type / field đó).
- Lọc type: `Select` "All" / từng type.

**Tab Data sources:**

```text
Data sources (3)                                    [Actions ▾] [Create data source]
 ◯ Name          Type             Resource
 ◯ todos-table   DynamoDB table   lc-todos ↗
 ◯ notify-fn     Lambda function  notify ↗
 ◯ local         None             —
```

- `ListDataSources`. Resource: `TableLink` (mới, DynamoDB, như `QueueLink`) / `FunctionLink` (có sẵn); bảng / function đã xóa → "(not found)".
- Actions: Edit, Delete. Delete khóa khi resolver hoặc function đang dùng, `disabledReason` "Used by Query.getTodo and function saveTodo." (Floci cho xóa, query sau đó lỗi, 7 #8). "Đang dùng" dò từ resolver của mọi type (tab Schema) và `ListFunctions`.
- Modal (3.5).

**Tab Functions:**

```text
Functions (2)                                       [Actions ▾] [Create function]
 ◯ Name        Data source    Runtime   Used by
 ◯ saveTodo    todos-table    JS        Mutation.addTodo
```

- `ListFunctions`. Used by: dò `pipelineConfig.functions` của mọi resolver (vì `ListResolversByFunction` luôn rỗng, 7 #8).
- Actions: Edit (mở 3.4 cho function), Delete (khóa khi đang dùng, lý do như data source).

**Tab Queries** (3.6). **Tab Settings** (3.7).

### 3.3 Create API — `/appsync/apis/create`

| Trường        | Ghi chú                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Name          | Bắt buộc, tối đa 65 ký tự, chữ / số / `_` / `-` / khoảng trắng (luật AWS)                       |
| Authorization | `FormTiles`: API key · Amazon Cognito user pool · AWS IAM. Mặc định API key                     |
| User pool     | Chỉ với Cognito: `FormSelect` từ `useUserPools`; không có pool: mô tả + link "Create user pool" |

- Trang form như Create distribution: `Form` + `Container`, nút ở `ResponsiveActions`, `useSubmitOnce`.
- Gửi `CreateGraphqlApi` (Cognito: `userPoolConfig { userPoolId, awsRegion, defaultAction: "ALLOW" }`), rồi **lưu luôn schema mẫu** (mục 4) bằng `StartSchemaCreation`: API mới không bao giờ thiếu schema, vì `GetIntrospectionSchema` của API chưa có schema trả 404 (7 #17) và trình duyệt ghi lỗi. Auth API key thì `CreateApiKey` hạn 7 ngày. Xong mở tab Schema, flash "Created API …".

### 3.4 Trang resolver / function — `/appsync/apis/:apiId/resolvers/:type/:field`, `…/functions/create`, `…/functions/:functionId`

Code cần chỗ rộng nên là trang riêng (như trang resolver của AWS console), không phải modal.

```text
Resolver Query.getTodo                                    [Cancel] [Save]
Floci checks the code only when a query runs: run one in Queries after saving.
Configuration
  Resolver type   (•) Unit  ( ) Pipeline            ← chỉ khi tạo
  Runtime         (•) JS    ( ) VTL
  Data source     [todos-table ▾]                    ← Unit
  Functions       1. [saveTodo ▾] [Remove]  [Add function]   ← Pipeline
Code
  [ code editor javascript / velocity ]
```

| Trường        | Ghi chú                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Resolver type | `FormTiles` Unit / Pipeline, chỉ khi tạo                                                                         |
| Runtime       | `FormRadioGroup` JS (`APPSYNC_JS` 1.0.0) / VTL. Mặc định JS (như AWS console)                                    |
| Data source   | Unit và function: `FormSelect` các data source của API, bắt buộc                                                 |
| Functions     | Pipeline: danh sách có thứ tự (thứ tự chạy), `AttributeEditor` mỗi dòng một `Select`; thêm / bỏ dòng             |
| Code          | JS: một editor `javascript`. VTL: hai editor `velocity` "Request mapping template" / "Response mapping template" |
| Name          | Chỉ function: bắt buộc, không trùng function khác                                                                |

- Code mẫu khi tạo hoặc đổi data source / runtime mà code còn là mẫu (chưa sửa): theo loại data source (mục 4 — NONE, DynamoDB GetItem theo `id`, Lambda Invoke). Data source Lambda: mô tả "Floci passes arguments to Lambda only through an Invoke request; a resolver without code gets an empty event." (7 #6).
- Mở trang: resolver lấy từ dữ liệu `ListResolvers` của type (đã tải ở tab Schema), không gọi `GetResolver` (field chưa có resolver → 404, 7 #17); có thì là sửa, không thì là tạo.
- Lưu: `CreateResolver` / `UpdateResolver`, `CreateFunction` / `UpdateFunction`. Xong về tab nguồn (Schema / Functions), flash "Saved resolver Query.getTodo".
- Rời trang khi có thay đổi chưa lưu: hỏi lại.

### 3.5 Modal data source (Create / Edit)

| Trường      | Ghi chú                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Name        | Bắt buộc, chữ / số / `_` (luật AWS), không trùng. Sửa thì chỉ hiện        |
| Type        | `FormTiles`: None · DynamoDB table · Lambda function. Chỉ khi tạo         |
| Table       | DynamoDB: `FormSelect` từ `useTables`; không có bảng: link "Create table" |
| Function    | Lambda: `FormSelect` từ `useFunctions`; mô tả về template Invoke (7 #6)   |
| Description | Tùy chọn                                                                  |

- Không gửi `serviceRoleArn`: Floci nhận data source không có role và vẫn gọi được bảng / function (7 #15).

### 3.6 Tab Queries

```text
Query                                                   [Run]
  Authorization  [API key ▾]   Key [da2-abc… (expires 2026-12-02) ▾]
  [ editor graphqlschema: query GetTodo($id: ID!) { getTodo(id: $id) { id title } } ]
  ▸ Variables (JSON)
Response   200 OK · 34 ms
  { "data": { "getTodo": { "id": "1", "title": "…" } } }          ⧉
```

- Bố cục như tab Test của Lambda: một `Container`, nút Run ở header, kết quả `CodeSnippet` JSON bên dưới kèm mã HTTP.
- **Authorization**: chỉ liệt kê các kiểu API bật (mặc định + phụ) trong ba kiểu console gọi được. Không có kiểu nào: `Alert` "The console can't call this API: it uses OpenID Connect or Lambda authorization." thay cho form.
  - API key: `Select` các key còn hạn (`ListApiKeys`); không có key: link sang Settings.
  - Cognito: chọn app client của pool (`useClients`), username, password → `useSignIn` của Cognito (có sẵn) → gửi `Authorization: Bearer <IdToken>` (7 #10). Hiện "Signed in as alice · Sign out"; token giữ trong state của tab, hết hạn thì đăng nhập lại. Challenge (đổi mật khẩu…): báo "Finish signing in on the user pool page." kèm link.
  - IAM: ký SigV4 (service `appsync`) bằng credential `test` của console, **ký theo host và path của `uris.GRAPHQL`** (`localhost.floci.io:4566`, `/v1/apis/{id}/graphql`) rồi gửi qua proxy; ký theo URL của proxy thì Floci báo sai chữ ký (7 #16).
- Gửi `POST` tới endpoint qua proxy (`/aws/v1/apis/{id}/graphql`, tránh CORS, 7 #1) với `{ query, variables, operationName }`. Nhiều operation trong editor: `Select` "Operation" (đọc bằng `graphql`). Operation là subscription: không gửi, `Alert` "Floci doesn't support subscriptions." (7 #11).
- Mã lỗi: 200 + `errors[]` hiện nguyên JSON; 401 → `Alert` "Not authorized: check the key or sign in again."; 502 "No schema definition exists" → "Save a schema first." (7 #5).
- Nhớ query + variables gần nhất của mỗi API trong localStorage (theo region + API ID, như test event của Lambda).

### 3.7 Tab Settings

```text
Details                                                   [Edit]
  Name todo-api   API ID c94d… ⧉   ARN arn:aws:appsync:… ⧉
  GraphQL endpoint http://localhost:4566/v1/apis/c94d…/graphql ⧉
Authorization                                             [Edit]
  Default  API key      Additional  AWS IAM
  User pool  ap-southeast-1_e635… ↗                       ← khi có Cognito
API keys (1)                                     [Actions ▾] [Create API key]
 ◯ API key            Description   Expires
 ◯ da2-abc… ⧉         web           2026-12-02 10:00
Connect                 [Node.js] [Python]  (code gọi query bằng API key)
```

- Edit details: đổi tên (`UpdateGraphqlApi`). Edit authorization: kiểu mặc định + auth phụ (`additionalAuthenticationProviders`, `FormMultiselect` các kiểu còn lại), user pool khi có Cognito. `UpdateGraphqlApi` gửi lại đủ field bắt buộc của API hiện tại.
- Kiểu auth console không sửa (`OPENID_CONNECT`, `AWS_LAMBDA`; Floci tạo được, chưa kiểm khi chạy query — 7 #17) và Cognito pool thứ hai trở đi: hiện nhãn, **giữ nguyên trong payload** khi lưu (không mất cấu hình CDK). Auth mặc định là một trong hai kiểu đó: khóa Edit authorization, lý do "Edit this authorization with CDK."
- Endpoint realtime không hiện (7 #11).
- API keys: Create (`FormModal`: Description, Expires in (days) 1–365, mặc định 7), Delete (`ConfirmModal` thường: "Apps using this key get 401."). Key hết hạn: cột Expires `StatusIndicator` warning "Expired".
- Connect: `ConnectCard` (`codeSamples.ts`) — `fetch` / `requests` gửi query mẫu tới endpoint, header theo auth: API key bật → `x-api-key` (key đầu tiên còn hạn, không có thì placeholder); không có API key mà có Cognito → `Authorization: Bearer <ID token>` (placeholder, comment chỉ sang thẻ Connect của app client Cognito); chỉ IAM → comment "Sign the request with SigV4 (service appsync)", không có code ký. Endpoint là URL cho app trên máy dev; mô tả thêm "Inside the same compose: http://localhost.floci.io:4566/…".

### 3.8 CloudFormation

- `StackLink type='AWS::AppSync::GraphQLApi' physicalId={apiId}` trong mô tả header 3.2 (physical ID = apiId, 7 #12).
- `resourceLinks.ts`: `AWS::AppSync::GraphQLApi` → chi tiết API; `AWS::AppSync::GraphQLSchema` (`<apiId>GraphQLSchema`) → tab Schema; `AWS::AppSync::DataSource` (ARN) → tab Data sources; `AWS::AppSync::Resolver` (ARN) → trang resolver; `AWS::AppSync::FunctionConfiguration` (ARN) → trang function. `AWS::AppSync::ApiKey` (`da2-…`) không có apiId: không link.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                       | Gọi                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Danh sách / chi tiết           | `ListGraphqlApis`, `GetGraphqlApi`                                                     |
| Schema                         | `GetIntrospectionSchema (SDL)`; lưu: `StartSchemaCreation` → `GetSchemaCreationStatus` |
| Resolver                       | `ListResolvers` mỗi type; `Get` / `Create` / `Update` / `DeleteResolver`               |
| Data source, function, API key | `List` / `Create` / `Update` / `Delete…` tương ứng                                     |
| Query                          | `fetch` POST `/aws/v1/apis/{id}/graphql`                                               |

**Endpoint.** Floci trả `uris.GRAPHQL = http://localhost.floci.io:4566/v1/apis/{id}/graphql` (host = `FLOCI_HOSTNAME`). Console hiện cho app trên máy dev: `flociPublicUrl` + path (`http://localhost:4566/v1/apis/{id}/graphql`), như URL của SQS / CloudFront; app trong compose dùng nguyên `uris.GRAPHQL`.

**Đọc schema.** `graphql` (`buildSchema`) đọc SDL kèm phần khai báo AppSync đặt trước: scalar `AWSDate`, `AWSTime`, `AWSDateTime`, `AWSTimestamp`, `AWSEmail`, `AWSJSON`, `AWSURL`, `AWSPhone`, `AWSIPAddress` và directive `@aws_api_key`, `@aws_iam`, `@aws_oidc`, `@aws_lambda`, `@aws_cognito_user_pools(cognito_groups: [String])`, `@aws_auth(cognito_groups: [String])`, `@aws_subscribe(mutations: [String])`. Đọc lỗi (SDL tạo ngoài console có cú pháp lạ): tab Schema vẫn hiện SDL, khối Resolvers chỉ liệt kê resolver của `Query`, `Mutation` (không có dòng "—").

**Code mẫu** (`resolverTemplates.ts`): JS và VTL cho NONE (trả lại `args`), DynamoDB (`GetItem` theo `args.id`), Lambda (`Invoke` với `payload: { arguments, identity }`); schema mẫu khi API chưa có schema: type `Todo { id: ID! title: String }`, `Query { getTodo(id: ID!): Todo }`, `Mutation { addTodo(id: ID!, title: String): Todo }`.

**Dò "đang dùng".** Resolver của mọi type (đã có ở tab Schema) + `ListFunctions`: data source dùng bởi resolver unit / function; function dùng bởi `pipelineConfig.functions`. Một hook chung `useApiUsage(apiId)` dùng cho tab Data sources và Functions.

---

## 5. Trạng thái và lỗi

| Tình huống                           | Hiển thị                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| API không có                         | "API … not found" kèm link về danh sách                                        |
| Lưu schema lỗi                       | `Alert` lỗi ở khối Schema, liệt kê message (không số dòng); schema cũ vẫn chạy |
| Lưu schema quá 30 giây chưa xong     | `Alert` "Floci is still processing the schema. Refresh in a moment."           |
| Xóa data source / function đang dùng | Menu khóa với lý do (3.2)                                                      |
| Bảng / function / user pool đã xóa   | Link "(not found)"                                                             |
| Query lỗi resolver / cú pháp         | Response JSON nguyên văn (`errors[]`)                                          |
| Query 401 / 502                      | `Alert` (3.6)                                                                  |
| Subscription                         | `Alert`, không gửi                                                             |
| API key dưới 1 ngày                  | Form chặn (1–365)                                                              |
| Code resolver sai                    | Lưu được; lỗi hiện khi chạy query (mô tả trên trang resolver)                  |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-appsync graphql @smithy/signature-v4 @aws-crypto/sha256-js -w web --min-release-age=7
npm install @aws-sdk/client-appsync -w tests --min-release-age=7
```

- `graphql` (graphql-js, bản tham chiếu): đọc type / field / operation. `@smithy/signature-v4` + `@aws-crypto/sha256-js`: ký query IAM (tests đã dùng hai gói này trong `signedAwsCall`).
- Tất cả chỉ import trong service AppSync (trang tải lười), không ở `shared/` hay `registry.ts` (development.md › Traps: bundle).

### Cấu trúc thư mục

```bash
web/src/services/appsync/
├── index.tsx, routes.ts, constants.ts    # AUTH_TYPES, DATA_SOURCE_TYPES, RUNTIMES, API_KEY_DAYS {1, 365, 7}, SCHEMA_POLL…
├── apis.ts                    # localEndpoint, schema đọc bằng graphql, field theo type, dò "đang dùng", lỗi schema
├── resolverTemplates.ts       # code mẫu, schema mẫu
├── schemas.ts                 # form tạo API, data source, resolver, function, API key, settings
├── codeSamples.ts             # Connect card
├── graphqlRequest.ts          # gửi query: header theo auth, ký SigV4
├── hooks/                     # useAppSync, useApis, useSchema, useResolvers, useDataSources, useFunctions, useApiKeys, useApiUsage
├── pages/                     # ApiList, ApiDetail, CreateApi, ResolverPage, FunctionPage
└── components/                # SchemaTab, ResolversTable, DataSourcesTab, DataSourceModal, FunctionsTab, QueriesTab, SettingsTab, …
web/src/services/dynamodb/components/TableLink.tsx
```

- Một dòng trong `registry.ts`, `category: "integration"`.
- `resourceLinks.ts` (3.8). `tests/it/leftovers.mjs`: API tên `lc-it-*` / `lc-e2e-*`.

### Dùng lại

| Thành phần                                                                                             | Dùng cho                     |
| ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `useZodForm`, `FormFields`, `useSubmitOnce` | Bảng, actions, form          |
| `CodeEditor` (thêm ngôn ngữ `graphqlschema`, `velocity` — Ace có sẵn)                                  | Schema, code resolver, query |
| `CodeSnippet`, `ConnectCard`, `copyable`, `ReferenceLink`, `FunctionLink`                              | Response, Connect, link      |
| `useSignIn`, `useClients`, `useUserPools` (Cognito), `useTables`, `useFunctions`                       | Queries, form                |
| `readStorage` / `writeStorage`                                                                         | Nhớ query gần nhất           |
| `pageState`, `StackLink`, `notifyOutcome`, `useIsCompact`, `ResponsiveTable`                           | Trang chi tiết               |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-25 qua proxy `/aws` (REST `/v1/apis…`, ký SigV4 `appsync`). Resource tạm (`lc-it-appsync-*`) đã xóa.

| #   | Rủi ro                        | Kết quả                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **API, endpoint**             | Create / Get / List / Update / Delete chạy; Delete trả 204. `uris.GRAPHQL` = `http://localhost.floci.io:4566/v1/apis/{id}/graphql`, dùng được từ máy dev và qua proxy `/aws/v1/apis/{id}/graphql`. API không có: 404 `NotFoundException`. Phân trang `nextToken` đúng                                                                          |
| 2   | **Schema, type**              | `GetIntrospectionSchema` SDL trả SDL nguyên văn (format JSON cũng trả SDL). `ListTypes` luôn rỗng, `GetType` 404. Query `__schema` trên endpoint chạy                                                                                                                                                                                          |
| 3   | **Lưu schema**                | `StartSchemaCreation` → `PROCESSING` → `SUCCESS` trong ~1 giây. SDL sai → `FAILED`, `details` là chuỗi JSON có `codeErrors[]`; **số dòng lệch ~27**. Schema cũ vẫn chạy                                                                                                                                                                        |
| 4   | **Data source**               | NONE, DynamoDB, Lambda, HTTP, RDS tạo được; tên trùng → 400                                                                                                                                                                                                                                                                                    |
| 5   | **Query**                     | Đúng → 200 `data`. Field sai / cú pháp → 200 `errors[]` (`ValidationError`, `SyntaxError`). Resolver `$util.error` → 200 `data` null + `errors[]`. Key sai / thiếu → 401. API chưa có schema → **502** `GraphQLSchemaException`                                                                                                                |
| 6   | **Resolver theo data source** | DynamoDB VTL / JS đọc ghi bảng thật; `ctx.args` có giá trị (lỗi cũ đã hết). Lambda: **direct resolver nhận event `{}`**; qua request `Invoke` (VTL hoặc JS `{ operation: "Invoke", payload }`) thì function nhận payload và query trả kết quả của function. NONE với JS (`{ payload: ctx.args }`) chạy. HTTP: query lỗi `UnsupportedOperation` |
| 7   | **Kiểm code**                 | Create / Update nhận code JS sai và resolver trên field không có trong schema; lỗi chỉ hiện khi query (`SyntaxError`, `UnsupportedFeature` cho `throw`)                                                                                                                                                                                        |
| 8   | **Phụ thuộc**                 | Xóa data source / function đang dùng → 204; query sau đó lỗi `InternalFailureException`. `ListResolversByFunction` luôn `[]`. Pipeline JS + VTL chạy, `ctx.prev.result`, `ctx.stash` đúng                                                                                                                                                      |
| 9   | **API key**                   | Không đặt hạn → 7 ngày, làm tròn xuống giờ. Dưới 1 ngày → 400 `ApiKeyLimitExceededException`                                                                                                                                                                                                                                                   |
| 10  | **Cognito, IAM**              | Cognito: **chỉ nhận `Authorization: Bearer <token>`** (token trơn → 401, AWS nhận cả hai); IdToken và AccessToken đều được; chữ ký token có kiểm; `cognito_groups` chặn đúng. IAM ký SigV4 chạy; auth phụ chạy                                                                                                                                 |
| 11  | **Subscription**              | WebSocket tới `uris.REALTIME` đóng 1006 (không có route); subscription qua HTTP → `OperationNotSupported`                                                                                                                                                                                                                                      |
| 12  | **CloudFormation**            | GraphQLApi + Schema + DataSource + Resolver + ApiKey: CREATE_COMPLETE, query chạy. Physical ID: API = apiId; Schema = `<apiId>GraphQLSchema`; ApiKey `da2-…`; DataSource / Resolver = ARN. Xóa stack xóa API                                                                                                                                   |
| 13  | **Evaluate**                  | `EvaluateMappingTemplate`, `EvaluateCode` → 404 `UnknownOperationException`                                                                                                                                                                                                                                                                    |
| 14  | **Container phụ**             | Query đầu tiên bật `floci-aws-graphql` và `floci-aws-appsync-js-runtime` (`node:22-alpine`), mở **cổng ngẫu nhiên trên `0.0.0.0` / `[::]`**; `/health` của JS runtime trả lời không cần auth. Vẫn chạy sau khi xóa hết API. Console không chặn được: ghi Traps                                                                                 |
| 15  | **Data source không có role** | `CreateDataSource` DynamoDB / Lambda không có `serviceRoleArn` → 200; resolver vẫn gọi được function                                                                                                                                                                                                                                           |
| 16  | **Query qua proxy**           | `x-api-key` qua `/aws/v1/apis/{id}/graphql` chạy (key sai → 401). IAM ký theo URL proxy → 400 sai chữ ký (Floci dựng lại request với host `localhost.floci.io:4566`, path `/v1/apis/{id}/graphql`); ký theo host / path đó rồi gửi qua proxy → 200. Trang cùng origin với proxy không gửi preflight CORS                                       |
| 17  | **Đọc khi chưa có gì**        | API chưa có schema: `GetIntrospectionSchema` → **404** `NotFoundException` "Schema not found". `GetResolver` field không có resolver → 404; `ListResolvers` / `ListFunctions` rỗng → 200 `[]`. `CreateGraphqlApi` với `OPENID_CONNECT`, `AWS_LAMBDA` → 200                                                                                     |

**Chưa kiểm:** query trên API auth OIDC / Lambda authorizer; sau `docker restart` Floci API còn chạy không; data source RDS chạy query thật; giới hạn kích thước schema.

---

## 8. Thứ tự làm

1. User cài package (mục 6). `registry.ts`, `useAppSync`, routes, constants.
2. Hàm thuần + unit test: `apis.ts` (endpoint local, đọc SDL có directive AppSync, field theo type, dò "đang dùng", gom lỗi schema bỏ số dòng), `resolverTemplates.ts`, schemas form, `graphqlRequest.ts` (header theo auth, ký SigV4).
3. Danh sách, Create API, chi tiết + Settings (details, authorization, API keys, Connect).
4. Tab Schema: editor, lưu bất đồng bộ, khối Resolvers.
5. Data sources (`TableLink`), Functions, trang resolver / function.
6. Tab Queries (API key, Cognito, IAM; nhớ query gần nhất).
7. StackLink, `resourceLinks.ts`, leftovers.
8. Test: integration `tests/it/appsync.test.ts` (schema lưu / lỗi, resolver DynamoDB JS đọc ghi, Lambda qua Invoke, 401 key sai, Cognito Bearer, IAM qua proxy, xóa data source đang dùng vẫn 204); E2E một luồng chính (Create API → sửa schema → data source DynamoDB → resolver JS → Queries chạy mutation rồi query → Settings tạo key → xóa API); danh sách và Create API vào `tests/ui/responsive.spec.ts`.
9. development.md › Traps (Bearer, subscription, `ListTypes`, số dòng lỗi schema, Lambda direct, HTTP, phụ thuộc, container phụ trên `0.0.0.0`). README: dòng AppSync.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024, 390 và 320px, light / dark, không trang nào cuộn ngang.

---

## 9. Cách đã cân nhắc

**Phạm vi**

| Cách                                                       | Đánh đổi                                                         | Chọn           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| A. Xem + chạy query + API key                              | Nhẹ (M); sửa resolver phải deploy CDK lại                        |                |
| **B. Như AWS console, trừ phần Floci không chạy**          | Nặng (L); đúng tiêu chí chọn                                     | ✅ (user chốt) |
| C. A + tạo API, sửa schema; data source / resolver chỉ xem | Claude đề xuất trước, nhưng dựa trên bộ lọc riêng ngoài tiêu chí |                |

**Đọc type / field của schema** (`ListTypes` của Floci rỗng)

| Cách                                                       | Đánh đổi                                                                     | Chọn                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| **A. `graphql` (`buildSchema`) đọc SDL trong trình duyệt** | Thêm một gói; đúng với mọi cú pháp; dùng lại để tách operation ở tab Queries | ✅ (đề xuất của Claude) |
| B. Query `__schema` trên endpoint                          | Không thêm gói, nhưng phải có auth (key / token) mới đọc được schema         |                         |
| C. Regex trên SDL                                          | Không thêm gói; vỡ với comment, description, directive                       |                         |

**Gửi query**

| Cách                                                 | Đánh đổi                                                               | Chọn                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| **A. `fetch` qua proxy `/aws/v1/apis/{id}/graphql`** | Không CORS, cùng đường với SDK; endpoint hiện cho user vẫn là URL thật | ✅ (đề xuất của Claude) |
| B. `fetch` thẳng `uris.GRAPHQL`                      | Phụ thuộc CORS của Floci, host `localhost.floci.io` cần DNS            |                         |

## 10. Quyết định

| Quyết định                                                                                                                               | Lý do                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Phạm vi hướng B, trừ subscription, Evaluate, HTTP, Lambda direct, caching / merged / event API; spec duyệt 2026-11-25                    | User chốt 2026-11-25 theo tiêu chí chọn                                                  |
| Route `/appsync/apis`, `…/create`, `…/:apiId?tab=` (Schema, Data sources, Functions, Queries, Settings), trang resolver / function riêng | Đề xuất của Claude: như AWS console; code cần chỗ rộng                                   |
| Sidebar nhóm Application integration, mục APIs, icon `IconGraph`                                                                         | Đề xuất của Claude: màu icon AppSync của AWS thuộc nhóm này                              |
| Resolver liệt kê theo field đọc từ SDL bằng `graphql`                                                                                    | Đề xuất của Claude (mục 9)                                                               |
| Query gửi qua proxy; endpoint hiện bằng `flociPublicUrl`; IAM ký theo host / path của `uris.GRAPHQL`                                     | Đề xuất của Claude (mục 9, mục 4); Floci kiểm chữ ký theo host của nó (7 #16)            |
| Data source không gửi `serviceRoleArn`                                                                                                   | Đề xuất của Claude: Floci không cần (7 #15); bớt một field người dùng không hiểu ở local |
| Cognito trong Queries: đăng nhập user bằng `useSignIn` có sẵn, gửi `Bearer`                                                              | Đề xuất của Claude: Floci chỉ nhận Bearer (7 #10)                                        |
| Console chặn xóa data source / function đang dùng, tự dò "đang dùng"                                                                     | Đề xuất của Claude: như origin của CloudFront; Floci cho xóa rồi query lỗi (7 #8)        |
| Lỗi schema hiện message, bỏ số dòng                                                                                                      | Đề xuất của Claude: số dòng của Floci lệch (7 #3)                                        |
| Runtime mặc định JS; Lambda dùng template Invoke                                                                                         | Đề xuất của Claude: như AWS console; Floci không chạy Lambda direct (7 #6)               |
| Tạo API lưu luôn schema mẫu; trang resolver đọc từ `ListResolvers`, không `GetResolver`                                                  | Đề xuất của Claude: tránh 404 làm trình duyệt ghi lỗi (7 #17)                            |
| OIDC / Lambda authorizer, Cognito pool thứ hai: chỉ hiện, giữ nguyên khi lưu; Queries không gọi được thì báo                             | Đề xuất của Claude: Floci tạo được nhưng chưa kiểm khi chạy; không làm mất cấu hình CDK  |
| Connect: header theo auth (API key → Cognito Bearer → chỉ comment cho IAM)                                                               | Đề xuất của Claude: mẫu luôn dùng `x-api-key` sẽ sai với API không bật API key           |
| Tạo API auth API key thì tạo luôn key 7 ngày                                                                                             | Đề xuất của Claude: như AWS console; Floci mặc định 7 ngày (7 #9)                        |
| Nhớ query gần nhất mỗi API (localStorage), không lưu nhiều query                                                                         | Đề xuất của Claude: nhẹ; saved query để sau                                              |
| Container phụ trên `0.0.0.0`: chỉ ghi Traps                                                                                              | Đề xuất của Claude: do Floci, console không chặn được                                    |
| UI theo convention có sẵn: menu `Actions`, `ReferenceLink`, `copyable`, `FormTiles` / `FormRadioGroup`, `ConnectCard`                    | User yêu cầu: component consistent, theo convention                                      |
| Không sửa server                                                                                                                         | AppSync là AWS API + endpoint GraphQL, đi qua proxy `/aws`                               |
