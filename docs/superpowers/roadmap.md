# Local Console — Roadmap service

> Ngày: 2026-11-17 · Trạng thái: chờ duyệt · Thuộc: [Local Console](specs/2026-11-09-localconsole-design.md)

Tài liệu này chọn service làm tiếp sau đợt 1 (S3, Lambda, DynamoDB, ElastiCache, Amazon MQ) và chia việc cho người mới vào.

## 1. Cách chọn service

Floci 2.4.0 giả lập [145 service](https://floci.io/floci/services/). Chỉ làm service (và tính năng) thỏa ít nhất một điều kiện:

1. **Dev thường dùng** khi code, chạy local, test.
2. **Cần để nối với service khác** cho trọn flow (vd: SNS → SQS → Lambda).

Service dev local ít đụng, Floci chỉ lưu cấu hình mà không chạy thật, hoặc làm ra ít giá trị thì **không làm**.

Thêm hai câu hỏi để xếp thứ tự:

- **Có cần sửa backend không?** Service AWS thuần đi qua proxy `/aws`, chỉ làm frontend. Service có giao thức riêng (SQL, MongoDB, Kafka) cần cầu nối ở backend như Redis/RabbitMQ, tốn công hơn.
- **Service đã làm có đang chờ nó không?** (vd: S3 notification đã cho chọn đích SNS nhưng chưa có trang SNS).

## 2. Đợt 2 — giá trị cao, chỉ frontend

Làm trước. Mỗi service độc lập, **chia được cho nhiều người làm song song**.

| Service                     | Dev dùng để                                                                                                                                                                | Nối với                                                 | Công | Ghi chú                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQS**                     | Xem message app gửi, gửi thử, test flow DLQ                                                                                                                                | Lambda trigger, S3 notification, SNS                    | M    | **Đã làm** (2026-11-18): [sqs-design](specs/2026-11-17-sqs-design.md)                                                                                      |
| **SES**                     | **Hộp thư local**: xem mail app đã gửi (đăng ký, quên mật khẩu…); thêm identity gửi; template                                                                              | SNS (bounce/complaint)                                  | M    | **Đã có spec:** [ses-design](specs/2026-11-17-ses-design.md). Floci lưu mọi mail, xem qua `GET /_aws/ses`. Đổi so với spec chính (trước ghi "không làm")   |
| **SNS**                     | Tạo topic, subscribe SQS/Lambda, publish thử                                                                                                                               | SQS, Lambda, S3 notification, SES                       | M    | **Đã có spec:** [sns-design](specs/2026-11-18-sns-design.md). Làm sau SQS để dùng dropdown queue                                                           |
| **EventBridge + Scheduler** | Rule bắt event, gửi event thử; lịch chạy Lambda/SQS (cron)                                                                                                                 | Lambda, SQS, SNS                                        | M    | **Đã duyệt spec:** [eventbridge-design](specs/2026-11-19-eventbridge-design.md). Làm sau SNS                                                               |
| **Cognito User Pools**      | Tạo user, xác nhận, đặt lại mật khẩu, xem group — test flow đăng nhập local                                                                                                | Lambda trigger của Cognito                              | M    | **Đã duyệt spec:** [cognito-design](specs/2026-11-19-cognito-design.md). Thêm Lambda trigger, federated IdP (OIDC/Google), domain; không làm identity pool |
| **CloudFormation**          | Xem stack mà CDK/SAM deploy lên Floci: events (deploy lỗi vì sao), outputs, resource; **đánh dấu resource bị Floci stub** (không tạo gì nhưng stack vẫn `CREATE_COMPLETE`) | Mọi service: resource link sang trang service tương ứng | M    | **Đã duyệt spec:** [cloudformation-design](specs/2026-11-19-cloudformation-design.md). Chỉ xem stack (Events, Resources, Outputs), xóa stack, `StackLink`  |

## 3. Đợt 3 — giá trị cao, phức tạp hơn

| Service                     | Dev dùng để                                                                                                                                                                                                                                                  | Nối với                                | Công | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway (HTTP/REST)** | Xem API, route → Lambda, gọi thử, lấy invoke URL                                                                                                                                                                                                             | Lambda                                 | L    | **Đã duyệt spec:** [apigateway-design](specs/2026-11-19-apigateway-design.md). REST + HTTP + WebSocket một trang; xem cấu trúc, invoke URL, gọi thử                                                                                                                                                                                                                                                                                                            |
| **RDS (Postgres/MySQL)**    | Xem instance, lấy connection string; **SQL editor** xem/sửa dữ liệu                                                                                                                                                                                          | —                                      | L    | **Đã duyệt spec:** [rds-design](specs/2026-11-19-rds-design.md): chỉ instance Postgres / MySQL (có Easy create), không Aurora, không SQL editor; compose mở cổng 7001-7099 để máy dev kết nối.                                                                                                                                                                                                                                                                 |
| **Step Functions**          | Xem state machine, chạy thử, xem từng bước của execution                                                                                                                                                                                                     | Lambda, SQS, SNS                       | M    | **Đã duyệt spec:** [stepfunctions-design](specs/2026-11-19-stepfunctions-design.md) (đủ dùng). Chỉ dự án dùng Step Functions mới cần                                                                                                                                                                                                                                                                                                                           |
| **CloudWatch Logs**         | Xem log group bất kỳ (không chỉ của Lambda), lọc, tự làm mới                                                                                                                                                                                                 | Mọi service ghi log                    | S    | **Đã duyệt spec:** [cloudwatch-logs-design](specs/2026-11-19-cloudwatch-logs-design.md). Đã có phần xem log trong Lambda (tab Monitor), tách ra dùng chung                                                                                                                                                                                                                                                                                                     |
| **EC2**                     | (1) Xem instance CDK tạo: trạng thái, tag, security group, VPC/subnet, stack nào tạo; (2) app gọi EC2 API (start/stop, đọc tag…): thấy trạng thái đổi, sửa tag, bật/tắt tay để test; (3) test **user data**: xem user data của instance, output/log khi chạy | CloudFormation (link instance ↔ stack) | M    | **Đã duyệt spec:** [ec2-design](specs/2026-11-19-ec2-design.md): tính năng hay dùng (danh sách, start / stop / reboot / terminate, user data, launch tối giản); không networking, hibernate, tag. Floci chạy mỗi instance là **container Docker**, không phải VM; VPC gần như metadata. **Phải kiểm trước:** Floci có chạy user data không (mặc định container chỉ chạy `tail -f /dev/null`; có catalog image chạy `/sbin/init`), và `GetConsoleOutput` trả gì |
| **MCP server**              | AI agent (Claude Code, Cursor…) tự xem trạng thái Floci local khi debug cùng dev: hộp thư SES, peek SQS, log Lambda, dữ liệu DynamoDB/S3                                                                                                                     | Mọi service                            | M    | **Bản đầu chỉ đọc**, chỉ nói chuyện với Floci (không chạm AWS thật). Bước đầu: kiểm có MCP sẵn dùng được với endpoint local không; có thì chỉ viết phần endpoint riêng của Floci. Đặt trong backend (`/mcp`, được `localOnly` bảo vệ) hay process stdio riêng: chốt ở spec. Làm sau SQS và SES                                                                                                                                                                 |

## 4. Để sau — làm khi có dự án dùng

| Service                               | Lý do để sau                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DocumentDB (MongoDB)                  | Cần cầu nối MongoDB ở backend. Làm khi có dự án dùng                                                                                                                                                                                                                                                                                                                      |
| Kinesis                               | **Đã duyệt spec:** [kinesis-design](specs/2026-11-19-kinesis-design.md) (đưa lên làm: Floci chạy tốt, trigger Lambda đã xác minh). Ít dự án dùng khi dev local. Floci lưu record thật, có peek `/_aws/kinesis/records`; Lambda trigger từ Kinesis chưa xác minh — kiểm trước khi làm                                                                                      |
| ECS                                   | Floci chạy task thật (container, log ra CloudWatch, đăng ký target ELB), nhưng team chạy app bằng `docker compose`. Làm khi đổi cách chạy local; lúc đó xét thêm ECR và ELB/Target group. Cần kiểm EC2 launch type và cách mở port của task                                                                                                                               |
| Secrets Manager + SSM Parameter Store | **Đã duyệt spec:** [secrets-ssm-design](specs/2026-11-19-secrets-ssm-design.md) (đưa lên làm sớm: công nhỏ, nối Lambda / CloudFormation / RDS). Giá trị thường seed một lần bằng script/IaC rồi không đụng. Làm khi có dự án đọc secret lúc chạy local (vd: Lambda trong Floci gọi `GetSecretValue`). Bẫy: Floci trả `SecureString` dạng rõ cả khi thiếu `WithDecryption` |
| Athena                                | Floci chạy SQL thật (DuckDB đọc S3 qua Glue). Làm khi có dự án dữ liệu; dùng chung SQL editor với RDS. Lưu ý: chạy được ở local chưa chắc chạy được trên AWS (DuckDB ≠ Trino)                                                                                                                                                                                             |

## 5. Không làm

| Nhóm                                                                    | Lý do                                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| IAM, STS, Organizations, Identity Center, KMS, ACM                      | Floci không bắt buộc quyền khi dev local; key/cert ít đụng                                                                       |
| Auto Scaling, EKS, Route 53, CloudFront, WAF                            | App local chạy bằng `docker compose`, không chạy trên ASG/EKS. Resource do CDK tạo vẫn xem trong trang CloudFormation            |
| CodePipeline, CodeDeploy, X-Ray, Service Catalog                        | Pipeline và chuyển traffic là chuyện phát hành; X-Ray cần app tự gắn SDK + daemon, Lambda/API Gateway của Floci không sinh trace |
| Bảo mật, kiểm toán, chi phí (GuardDuty, Security Hub, Config, Budgets…) | Không có dữ liệu thật khi dev local                                                                                              |
| AI/ML (Bedrock, SageMaker, Textract…)                                   | Floci phần lớn là stub, trả kết quả giả                                                                                          |
| Phân tích dữ liệu khác (Redshift, Glue, EMR…)                           | Ít dự án dùng khi dev local; giao diện lớn                                                                                       |
| OpenSearch, MSK (Kafka), CodeBuild, ECR, ELB, CloudShell                | User chốt 2026-11-17: không cần. MCP (đợt 3) và console đã phủ nhu cầu xem nhanh thay cho CloudShell                             |

## 6. Phụ thuộc giữa các service

```text
SQS ──► SNS ──► EventBridge + Scheduler
 │       │
 │       └──► SES (thông báo bounce/complaint)
 └──► (dropdown queue cho Lambda trigger, S3 notification)

SES, CloudFormation, CloudWatch Logs: độc lập, làm lúc nào cũng được
Cognito: sau SES và SNS (xem mail, SMS gửi tới user)
MCP server: sau SQS và SES (tool có giá trị nhất dựa trên hai service này)
```

- **Làm song song được ngay:** SQS, SES, CloudFormation, CloudWatch Logs.
- **Chờ SQS:** SNS. **Chờ SQS và SNS:** EventBridge + Scheduler. **Chờ SQS và SES:** MCP server.

## 7. Quy trình làm một service (cho người mới)

Theo đúng cách đã làm đợt 1. Đọc trước: [docs/development.md](../development.md) (mục Traps & open issues), [CLAUDE.md](../../CLAUDE.md), spec chính.

1. **Spec** — `docs/superpowers/specs/<ngày>-<service>-design.md`, theo mẫu [SQS](specs/2026-11-17-sqs-design.md) hoặc [MQ](specs/2026-11-09-mq-design.md): Mục tiêu, Phạm vi (chọn theo mục 1), Màn hình, Cách hoạt động, Lỗi, Kỹ thuật, Rủi ro, Thứ tự làm, Quyết định.
2. **Kiểm rủi ro trên Floci thật** qua proxy `/aws` trước khi chốt spec (vd: SQS peek cần header region). Ghi kết quả vào mục Rủi ro.
3. **Duyệt spec** với lead.
4. **Code** — một folder trong `web/src/services/<service>/` (pages, components, hooks, schemas, constants) và **một dòng trong `web/src/registry.ts`**; sidebar, Home, router tự đọc từ đó. Route của service khai báo bằng `lazyPage` (trang tải lười), số resource trên Home thêm vào `web/src/pages/home/resourceCounts.ts`, để SDK của service không vào bundle chính. Dùng lại component trong `web/src/shared/`.
5. **Test** — unit cho logic thuần (`web/test/`), integration với Floci thật (`tests/it/`), một luồng E2E chính (`tests/e2e/`). Xem [tests/README.md](../../tests/README.md).
6. **Kiểm giao diện** ở 1440, 1024, 390px, không trang nào cuộn ngang.
7. **Cập nhật** spec (Trạng thái: đã làm, Kết quả thử) và [docs/development.md](../development.md) nếu có bẫy mới.

## 8. Việc chung nên làm trước khi đông người

| Việc                                  | Lý do                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Tách route theo service bằng `lazy()` | Mỗi service thêm làm bundle lớn thêm (đang 2.2 MB JS, xem docs/development.md › Traps & open issues) |
