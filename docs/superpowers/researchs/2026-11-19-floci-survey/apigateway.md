# API Gateway (v1 REST + v2 HTTP) — ghi chú khảo sát Floci 2.4.0 (2026-11-19)

Nguồn: 2 agent (khảo sát đầu, điểm nối). Script: `scratchpad/apigw2/` (verify.py).

## Hướng đã đề xuất (chưa chốt phạm vi chi tiết)

- Một trang gộp v1 + v2 (cột Type). Không sửa server. Công L (MVP xem + invoke URL + gọi thử ≈ M).
- Làm: danh sách API, xóa; chi tiết v1 cây resource → method → integration (`GET /restapis/{id}/resources?embed=methods` một call); chi tiết v2 route → integration; authorizer; stage + invoke URL (máy dev + container); **gọi thử** qua `/aws/restapis/{id}/{stage}/_user_request_{path}` (chạy cả v1 và v2, không vướng localOnly/CORS); link integration/authorizer sang Lambda/Cognito/SQS/SNS/DDB/SFN/EventBridge; StackLink; Lambda › Triggers nguồn API Gateway (quét integration).
- Để sau (đoán): tạo/sửa API bằng form, import/export OpenAPI, custom domain, API key/usage plan, WebSocket (cần kiểm).
- Không làm: nút Deploy, stage variables (Floci bỏ qua deployment/stage), access log, throttle/quota/cache, TestInvokeMethod/Authorizer (UnknownOperation).

## Khảo sát đầu

- v1/v2 Lambda proxy, path param, `{proxy+}`, MOCK (v1), HTTP/HTTP_PROXY ✅. Invoke URL: `/restapis/{id}/{stage}/_user_request_/…`, `/execute-api/{id}/{stage}/…`, `{id}.execute-api.localhost.floci.io:4566` (DNS public → 127.0.0.1, sai trong container). Dạng theo host không đi qua proxy được.
- v1 stage không tồn tại → 404; v1 deployment không snapshot (resource mới gọi được ngay); v2 bỏ qua stage hoàn toàn (`zzz` → 200), coi đoạn path đầu là stage nếu không khớp route.
- v2 `apiEndpoint` trả `https://{id}.execute-api.ap-southeast-1.amazonaws.com` → tự dựng URL.
- Lambda TOKEN/REQUEST authorizer ✅; v1 Cognito authorizer ✅; v1 API key ✅ (quota không áp dụng); CORS v1 gateway response ✅; v2 corsConfiguration ⚠️ (preflight vẫn gọi Lambda khi có `$default`).
- Import OpenAPI v1/v2 ✅; export v1 ✅, v2 ❌; custom domain ✅; access log không ghi; Lambda lỗi → 502 body rỗng; không cần AddPermission.

## Điểm nối (agent 2)

- v1 `AWS`: SQS `sqs:path/{acc}/{queue}` + template form ✅; `sqs:action/SendMessage` chỉ với template JSON ✅ (AWS dùng form); SNS `sns:action/Publish` template JSON ✅ (form/querystring/path ❌); DynamoDB PutItem/Query/GetItem ✅ (VTL response chạy); **S3 ❌ hoàn toàn**; Step Functions StartExecution/StartSyncExecution ✅; EventBridge PutEvents ✅ (X-Amz-Target qua requestParameters); Lambda non-proxy ✅.
- `integration.request.querystring.*` không chuyển cho service AWS. `selectionPattern` so với cả body lỗi (phải `.*X.*`).
- **v2 `integrationSubtype` ❌ toàn bộ**: không lưu, không validate, gọi → 500. UI chỉ đoán từ key requestParameters (`QueueUrl`, `StateMachineArn`, `Detail`/`Source`, `StreamName`) + ghi chú.
- v2 requestParameters trên HTTP_PROXY: header/querystring/path ✅, `$request.body.x` ❌, `${request.path.id}` → 500; Lambda AWS_PROXY bỏ qua requestParameters.
- VTL thiếu `$foreach.*`/`$velocityCount`; `$input.params().header.get` ❌; responseOverride.header → 500.
- GetIntegration v1 trả `httpMethod: null`.
- **JWT authorizer v2 + Cognito local:** cần CẢ `FLOCI_SECURITY_ALLOW_PRIVATE_JWT_TARGETS=true` VÀ `FLOCI_HOSTNAME=127.0.0.1`; issuer `http://127.0.0.1:4566/<pool>`. Rủi ro: FLOCI_HOSTNAME đổi mọi URL Floci trả (QueueUrl `127.0.0.1`) → ảnh hưởng console (FLOCI_PUBLIC_URL, so khớp URL), SSRF nội bộ, phải restart, CDK phải đặt issuer khác AWS.

## Nhận diện đích cho UI

- v1: parse `arn:aws:apigateway:{region}:{service}:(path|action)/{rest}`. Lambda: `lambda:path/2015-03-31/functions/{fnArn}/invocations` (có `${stageVariables.x}` → hiện thô). SQS path → tên queue; action → regex `"QueueUrl"…/([^/"]+)` trong template. SNS → regex `arn:aws:sns:…` trong template/requestParameters. DDB → `dynamodb:action/{Op}` + regex `"TableName"`. SFN → regex `arn:aws:states:…:stateMachine:…`. EventBridge → `EventBusName` (mặc định default). HTTP → URL. MOCK → "Mock". Không lấy được tên → service + action + xem raw template.
- v2: `integrationType`, `integrationUri` (Lambda ARN / URL), `requestParameters`.

## WebSocket API (main kiểm 2026-11-19)

- Không có TCP (AWS API Gateway cũng không; TCP là NLB).
- WebSocket data plane CHẠY: `ws://{apiId}.execute-api.{region}.localhost:4566/{stage}` → 101; `$connect`, message, `$disconnect` gọi Lambda (AWS_PROXY); route response `$default` trả tin về client; `POST /execute-api/{apiId}/{stage}/@connections/{id}` đẩy tin xuống client ✅; GET connection ✅.
- Path form `ws://localhost:4566/ws/{apiId}/{stage}` → 403 trên 2.4.0 (tài liệu nói có).
- Khác AWS: tin không khớp route nào rơi về `$default` nhưng `requestContext.routeKey` = giá trị của selection expression (vd "hello"), không phải `$default`.
- Console: gọi thử WebSocket qua proxy `/aws` không được (cần Host execute-api, proxy đổi Host; path form 403) → chỉ hiện ws URL để copy.
