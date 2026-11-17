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

| Service                     | Dev dùng để                                                                                                                                                                | Nối với                                                 | Công | Ghi chú                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQS**                     | Xem message app gửi, gửi thử, test flow DLQ                                                                                                                                | Lambda trigger, S3 notification, SNS                    | M    | **Đã có spec:** [sqs-design](specs/2026-11-17-sqs-design.md)                                                                                             |
| **SES**                     | **Hộp thư local**: xem mail app đã gửi (đăng ký, quên mật khẩu…); thêm identity gửi; template                                                                              | SNS (bounce/complaint)                                  | M    | **Đã có spec:** [ses-design](specs/2026-11-17-ses-design.md). Floci lưu mọi mail, xem qua `GET /_aws/ses`. Đổi so với spec chính (trước ghi "không làm") |
| **SNS**                     | Tạo topic, subscribe SQS/Lambda, publish thử                                                                                                                               | SQS, Lambda, S3 notification, SES                       | M    | **Đã có spec:** [sns-design](specs/2026-11-18-sns-design.md). Làm sau SQS để dùng dropdown queue                                                         |
| **EventBridge + Scheduler** | Rule bắt event, gửi event thử; lịch chạy Lambda/SQS (cron)                                                                                                                 | Lambda, SQS, SNS                                        | M    | Làm sau SQS và SNS (đích của rule)                                                                                                                       |
| **Cognito User Pools**      | Tạo user, xác nhận, đặt lại mật khẩu, xem group — test flow đăng nhập local                                                                                                | Lambda trigger của Cognito                              | M    | Floci có 91 action; chỉ làm phần user/group/app client                                                                                                   |
| **CloudFormation**          | Xem stack mà CDK/SAM deploy lên Floci: events (deploy lỗi vì sao), outputs, resource; **đánh dấu resource bị Floci stub** (không tạo gì nhưng stack vẫn `CREATE_COMPLETE`) | Mọi service: resource link sang trang service tương ứng | M    | Team dùng CDK. Stack do Terraform tạo không hiện ở đây (Terraform gọi thẳng API từng service)                                                            |

## 3. Đợt 3 — giá trị cao, phức tạp hơn

| Service                     | Dev dùng để                                                                                                                                                                                                                                                  | Nối với                                | Công | Ghi chú                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway (HTTP/REST)** | Xem API, route → Lambda, gọi thử, lấy invoke URL                                                                                                                                                                                                             | Lambda                                 | L    | Hai phiên bản API (v1 REST, v2 HTTP). Chốt làm một hay cả hai ở spec                                                                                                                                                                                                                           |
| **RDS (Postgres/MySQL)**    | Xem instance, lấy connection string; **SQL editor** xem/sửa dữ liệu                                                                                                                                                                                          | —                                      | L    | Floci chạy DB thật. SQL editor: thử RDS Data API của Floci trước; không được thì cầu nối ở backend (spec chính, mục 5)                                                                                                                                                                         |
| **Step Functions**          | Xem state machine, chạy thử, xem từng bước của execution                                                                                                                                                                                                     | Lambda, SQS, SNS                       | M    | Chỉ dự án dùng Step Functions mới cần                                                                                                                                                                                                                                                          |
| **CloudWatch Logs**         | Xem log group bất kỳ (không chỉ của Lambda), lọc, tự làm mới                                                                                                                                                                                                 | Mọi service ghi log                    | S    | Đã có phần xem log trong Lambda (tab Monitor), tách ra dùng chung                                                                                                                                                                                                                              |
| **EC2**                     | (1) Xem instance CDK tạo: trạng thái, tag, security group, VPC/subnet, stack nào tạo; (2) app gọi EC2 API (start/stop, đọc tag…): thấy trạng thái đổi, sửa tag, bật/tắt tay để test; (3) test **user data**: xem user data của instance, output/log khi chạy | CloudFormation (link instance ↔ stack) | M    | Floci chạy mỗi instance là **container Docker**, không phải VM; VPC gần như metadata. **Phải kiểm trước:** Floci có chạy user data không (mặc định container chỉ chạy `tail -f /dev/null`; có catalog image chạy `/sbin/init`), và `GetConsoleOutput` trả gì                                   |
| **MCP server**              | AI agent (Claude Code, Cursor…) tự xem trạng thái Floci local khi debug cùng dev: hộp thư SES, peek SQS, log Lambda, dữ liệu DynamoDB/S3                                                                                                                     | Mọi service                            | M    | **Bản đầu chỉ đọc**, chỉ nói chuyện với Floci (không chạm AWS thật). Bước đầu: kiểm có MCP sẵn dùng được với endpoint local không; có thì chỉ viết phần endpoint riêng của Floci. Đặt trong backend (`/mcp`, được `localOnly` bảo vệ) hay process stdio riêng: chốt ở spec. Làm sau SQS và SES |

## 4. Để sau — làm khi có dự án dùng

| Service                               | Lý do để sau                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DocumentDB (MongoDB)                  | Cần cầu nối MongoDB ở backend. Làm khi có dự án dùng                                                                                                                                                                                        |
| Kinesis                               | Ít dự án dùng khi dev local. Floci lưu record thật, có peek `/_aws/kinesis/records`; Lambda trigger từ Kinesis chưa xác minh — kiểm trước khi làm                                                                                           |
| ECS                                   | Floci chạy task thật (container, log ra CloudWatch, đăng ký target ELB), nhưng team chạy app bằng `docker compose`. Làm khi đổi cách chạy local; lúc đó xét thêm ECR và ELB/Target group. Cần kiểm EC2 launch type và cách mở port của task |
| Secrets Manager + SSM Parameter Store | Giá trị thường seed một lần bằng script/IaC rồi không đụng. Làm khi có dự án đọc secret lúc chạy local (vd: Lambda trong Floci gọi `GetSecretValue`). Bẫy: Floci trả `SecureString` dạng rõ cả khi thiếu `WithDecryption`                   |
| Athena                                | Floci chạy SQL thật (DuckDB đọc S3 qua Glue). Làm khi có dự án dữ liệu; dùng chung SQL editor với RDS. Lưu ý: chạy được ở local chưa chắc chạy được trên AWS (DuckDB ≠ Trino)                                                               |

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

SES, Cognito, CloudFormation, CloudWatch Logs: độc lập, làm lúc nào cũng được
MCP server: sau SQS và SES (tool có giá trị nhất dựa trên hai service này)
```

- **Làm song song được ngay:** SQS, SES, Cognito, CloudFormation, CloudWatch Logs.
- **Chờ SQS:** SNS. **Chờ SQS và SNS:** EventBridge + Scheduler. **Chờ SQS và SES:** MCP server.

## 7. Quy trình làm một service (cho người mới)

Theo đúng cách đã làm đợt 1. Đọc trước: [README](../../README.md) (mục Traps & open issues), [CLAUDE.md](../../CLAUDE.md), spec chính.

1. **Spec** — `docs/superpowers/specs/<ngày>-<service>-design.md`, theo mẫu [SQS](specs/2026-11-17-sqs-design.md) hoặc [MQ](specs/2026-11-09-mq-design.md): Mục tiêu, Phạm vi (chọn theo mục 1), Màn hình, Cách hoạt động, Lỗi, Kỹ thuật, Rủi ro, Thứ tự làm, Quyết định.
2. **Kiểm rủi ro trên Floci thật** qua proxy `/aws` trước khi chốt spec (vd: SQS peek cần header region). Ghi kết quả vào mục Rủi ro.
3. **Duyệt spec** với lead.
4. **Code** — một folder trong `web/src/services/<service>/` (pages, components, hooks, schemas, constants) và **một dòng trong `web/src/registry.ts`**; sidebar, Home, router tự đọc từ đó. Dùng lại component trong `web/src/shared/`.
5. **Test** — unit cho logic thuần (`web/test/`), integration với Floci thật (`tests/it/`), một luồng E2E chính (`tests/e2e/`). Xem [tests/README.md](../../tests/README.md).
6. **Kiểm giao diện** ở 1440, 1024, 390px, không trang nào cuộn ngang.
7. **Cập nhật** spec (Trạng thái: đã làm, Kết quả thử) và README nếu có bẫy mới.

## 8. Việc chung nên làm trước khi đông người

| Việc                                  | Lý do                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Tách route theo service bằng `lazy()` | Mỗi service thêm làm bundle lớn thêm (đang 2.2 MB JS, xem README › Traps & open issues) |
