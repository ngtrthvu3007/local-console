# CloudFormation — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã làm (2026-11-22; IT `it/cloudformation.test.ts`, E2E `cloudformation*.spec.ts`, UI `ui/cloudformation.spec.ts`; `StackLink` ở `shared`, đã gắn vào S3, Lambda, DynamoDB, SQS, ElastiCache, SNS, EventBridge rule / schedule, Step Functions; chưa làm cho Cognito, API Gateway, RDS, EC2… vì các service đó chưa có) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 2

## 1. Mục tiêu

Làm màn hình CloudFormation giống AWS CloudFormation Console cho stack mà CDK (hoặc SAM) deploy lên Floci. Dev local dùng để:

- Xem `cdk deploy` lên Floci tới đâu, **lỗi vì sao** (events, kể cả lỗi nằm ở nested stack).
- Thấy **resource nào bị Floci stub** (stack vẫn `CREATE_COMPLETE` nhưng không tạo gì, vd trang MQ trống).
- Từ stack đi sang trang service của từng resource, và ngược lại: từ trang bucket, function, bảng, queue… biết nó thuộc stack nào (`StackLink`).
- Lấy output (URL, ARN, tên) để cấu hình app; xem parameter và template đã deploy.
- Dọn stack ở local.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Đối chiếu với [tài liệu CloudFormation của Floci](https://floci.io/floci/services/cloudformation/) và đã chạy thử trên Floci 2.4.0 (mục 7). Tài liệu mô tả bản mới hơn 2.4.0, có nhiều chỗ 2.4.0 làm khác.

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác (tiêu chí quan trọng), **và** (3) Floci hỗ trợ toàn phần hoặc một phần. **Chỉ làm tính năng thỏa tiêu chí, không làm đủ như AWS.** Làm đơn giản: dùng thẳng những gì API của Floci trả, không viết thêm logic để bù chỗ Floci thiếu; mỗi tính năng phải có ích khi dev / test ở local trước khi lên production (user chốt 2026-11-19).

### Làm trong đợt này

| Nhóm            | Tính năng                                                                                            | Tiêu chí | Floci 2.4.0                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| Danh sách stack | Tên, status, reason, thời gian; tìm theo tên; tự làm mới khi có stack đang chạy                      | (1)      | Toàn phần (không phân trang)                             |
| Chi tiết stack  | Status, reason, thời gian, description                                                               | (1)      | Toàn phần (`Description` lấy bằng `GetTemplateSummary`)  |
| Tab Events      | Mới nhất trên; lọc chỉ lỗi; làm nổi lý do; link sang nested stack; tự làm mới khi đang chạy          | (1)      | Toàn phần                                                |
| Tab Resources   | Logical / physical ID, type, status, reason; **link sang trang service**; badge **Stubbed by Floci** | (1), (2) | Một phần: list không có reason (lấy từ events, mục 7 #4) |
| Cảnh báo stub   | `Alert` đầu trang liệt kê resource bị stub                                                           | (1)      | Toàn phần                                                |
| Tab Outputs     | Key, value (copy), export name                                                                       | (1)      | Toàn phần (không có `Description`)                       |
| Xóa stack       | Xác nhận; hiện lý do `DELETE_FAILED`                                                                 | (1)      | Toàn phần                                                |
| **StackLink**   | Trang chi tiết S3, Lambda, DynamoDB, SQS, ElastiCache hiện "Stack: X" (link)                         | (2)      | Toàn phần (qua index, 3.8)                               |

### Để sau

| Tính năng                                                        | Ghi chú                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Change set (xem, tạo, thực thi)                                  | Đoán dev ít dùng: xem diff bằng `cdk diff`. Floci không có diff theo property              |
| Tạo / update stack từ UI (upload template)                       | Đoán dev ít dùng: team deploy bằng `cdk deploy`                                            |
| Trang Exports                                                    | Đoán dev ít dùng; export đã hiện ở tab Outputs                                             |
| Termination protection, stack policy, tag                        | Đoán dev ít dùng                                                                           |
| Tab Parameters, Template; cột References (quan hệ giữa resource) | User chốt cắt 2026-11-19: dev xem trong code CDK / `cdk.out/`; không ảnh hưởng flow deploy |
| Stack đã xóa (lọc "Deleted")                                     | Đoán dev ít dùng                                                                           |
| Cảnh báo khi xóa stack có export đang bị import                  | Floci không chặn (7 #12) nhưng phải quét template mọi stack; ở local ít gặp                |
| Cảnh báo stub gộp cả stack con                                   | Phải gọi đệ quy; mở stack con thì thấy cảnh báo của nó                                     |
| Description của output, parameter; construct path CDK            | Floci không trả; phải đọc thêm từ template                                                 |

### Không làm

| Tính năng                        | Lý do                                    |
| -------------------------------- | ---------------------------------------- |
| Drift detection                  | Floci 2.4.0 `UnknownAction`              |
| Type registry                    | Floci 2.4.0 `UnknownAction`              |
| StackSets                        | Nhiều account, không phải việc dev local |
| Canvas (Infrastructure Composer) | User chốt 2026-11-19                     |

---

## 3. Màn hình

Theo quy tắc chung của DynamoDB, ElastiCache, MQ, SQS, SNS, EventBridge: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; cột số căn phải (`Figure`); thiếu giá trị là "—"; khung hẹp thì bảng thành hai tầng (`useIsCompact`); khối rỗng hoặc lỗi vẫn giữ khung. Logical ID của CDK và physical ID (URL, ARN) rất dài: cho xuống dòng (`overflow-wrap: anywhere`), không để trang cuộn ngang.

Sidebar: **Stacks**.

### 3.1 Danh sách stack — `/cloudformation/stacks`

```text
Stacks (3)                                             [↻] [Delete]
[🔍 Find stacks by name        ]
 ◯ Name ▲                         Status                    Created            Updated
 ◯ LcApp                          ✓ CREATE_COMPLETE         2026-11-19 09:12   —
 ◯ LcApp-Tables-1A2B             ✓ CREATE_COMPLETE         2026-11-19 09:12   —
 ◯ CDKToolkit                     ✕ UPDATE_ROLLBACK_COMPLETE 2026-11-19 08:01  2026-11-19 09:00
                                    Resource handler returned message: …
```

- `DescribeStacks` (không truyền tên) — có reason và `LastUpdatedTime`, `ListStacks` thì không (7 #2). Ẩn `DELETE_COMPLETE`.
- Status: `StatusIndicator` theo nhóm (3.9). Reason hiện dòng thứ hai dưới status (`white-space: pre-line`).
- Ô tìm theo tên. Tự làm mới mỗi `STACK_POLL_INTERVAL_MS` khi có stack `*_IN_PROGRESS`.
- Delete: chọn một stack, mở modal 3.7.
- Khung hẹp: tầng 1 tên + status, tầng 2 thời gian + reason.

### 3.2 Chi tiết stack — `/cloudformation/stacks/:stack`

```text
LcApp                                                   [↻] [Delete]
✕ UPDATE_ROLLBACK_COMPLETE · Created 2026-11-19 09:12 · Updated 09:30
Description: Local app stack
┌ ⚠ 2 resources were stubbed by Floci — nothing was created for them: Broker (AWS::AmazonMQ::Broker), Cache (AWS::ElastiCache::ReplicationGroup)
[Events] [Resources] [Outputs]
```

- `DescribeStacks(StackName)`. Description: `GetTemplateSummary` (Floci không trả trong `DescribeStacks`).
- **Cảnh báo stub** (`Alert` warning): resource của chính stack này có reason chứa `STUB_REASON_MARKER` trong events (3.4). Stack con có cảnh báo riêng ở trang của nó. Không có thì ẩn.
- Tab lưu trên URL (`?tab=`). **Mặc định mở Events** (việc chính là xem deploy lỗi vì sao).
- Stack đang `*_IN_PROGRESS`: tự làm mới header và tab đang mở mỗi `STACK_POLL_INTERVAL_MS`.
- Stack `REVIEW_IN_PROGRESS` (CDK tạo change set nhưng chưa thực thi): các tab rỗng hiện empty state thường (Floci trả rỗng, template `{}`).
- Stack không tồn tại (kể cả vừa xóa): "Stack … not found" kèm link về danh sách.

### 3.3 Tab Events

```text
Events (14)                                   [🔍 Find events] [☐ Failures only]
 Timestamp            Logical ID              Status                 Status reason
 09:30:02.114         LcApp                   ✕ UPDATE_ROLLBACK_…    —
 09:30:01.981         Queue4A7E3555           ✕ UPDATE_FAILED        Property VisibilityTimeout…
 09:30:01.903         NestedStackA1B2 ↗       ✕ UPDATE_FAILED        Nested stack LcApp-Nested… rolled back
```

- `DescribeStackEvents` (vòng `NextToken`). **Giữ thứ tự API trả** (mới nhất trên); không sort lại theo timestamp vì nhiều event cùng ms (7 #3).
- Timestamp hiện tới mili giây. Reason `pre-line`, dòng `*_FAILED` tô đỏ (`StatusIndicator` error).
- **Failures only** (`Toggle`): chỉ `*_FAILED`.
- Reason của custom resource chứa `ECONNREFUSED` và `:443`: thêm gợi ý dưới reason "Node.js custom resources (CDK autoDeleteObjects, BucketDeployment…) need Floci started with FLOCI_TLS_ENABLED=true." kèm link development.md › Traps (7 #20).
- Event của resource `AWS::CloudFormation::Stack`: logical ID kèm link sang stack con (physical ID của event là ARN stack con) — nguyên nhân gốc nằm trong events của stack con (7 #13).

### 3.4 Tab Resources

```text
Resources (9)                                                     [🔍 Find resources]
 Logical ID          Physical ID                     Type                     Status
 Queue4A7E3555       lc-app-queue ↗                  AWS::SQS::Queue          ✓ CREATE_COMPLETE  —
 Handler886CB40B     LcApp-Handler886C-1a2b ↗        AWS::Lambda::Function    ✓ CREATE_COMPLETE  HandlerRole, Queue4A7E3555
 HandlerRole…        LcApp-HandlerRole-…             AWS::IAM::Role           ✓ CREATE_COMPLETE  —
 Broker              Broker-9f1c2a3b  [Stubbed by Floci] AWS::AmazonMQ::Broker ✓ CREATE_COMPLETE —
```

- `ListStackResources` (vòng `NextToken`). Reason của từng resource: lấy event mới nhất của logical ID đó (list không có reason, 7 #4); hiện trong popover ở cột Status.
- **Physical ID có link** theo bảng 3.10. Type chưa có trang hoặc không link được thì text.
- **Badge Stubbed by Floci** (`Badge` severity) khi event của logical ID có reason chứa `STUB_REASON_MARKER`. Resource stub **không link** (trang service sẽ không thấy gì). Physical ID của stub đổi sau mỗi update (7 #5), không dùng làm khóa.
- `AWS::CDK::Metadata`: chữ màu phụ (Floci bỏ qua, physical ID `cdk-metadata-…`).

### 3.5 Tab Outputs

`DescribeStacks` `Outputs`: Key, Value (copy được), Export name.

### 3.7 Xóa stack (modal)

- `ConfirmModal` có sẵn: gõ `delete` để xác nhận, như các service khác.
- `DeleteStack`, rồi theo dõi tới khi xong. `DELETE_FAILED`: thông báo kèm reason của stack (Floci ghi resource lỗi, vd bucket còn object). Resource có `DeletionPolicy: Retain` được Floci giữ lại, events có dòng `DELETE_SKIPPED` (7 #19).
- Xóa xong về danh sách, làm mới index (3.8).

### 3.8 StackLink và index resource

**Index** (một query dùng chung, key `["cloudformation", "resource-index"]`):

1. `DescribeStacks` (bỏ `DELETE_COMPLETE`).
2. `ListStackResources` cho từng stack, bỏ resource `DELETE_COMPLETE`.
3. Map `(ResourceType, khóa chuẩn hóa của PhysicalResourceId)` → stack. Khóa chuẩn hóa: SQS dùng **tên queue** (`queueNameOfUrl`), còn lại dùng nguyên physical ID.

- SDK CloudFormation **nạp lười** trong `queryFn` (`await import("@aws-sdk/client-cloudformation")`) để không vào bundle chính của các trang service.
- `staleTime` `RESOURCE_INDEX_STALE_MS`; làm mới khi xóa stack trên console.
- Không có stack nào: một request, luôn 200.
- **Không dùng `DescribeStackResources?PhysicalResourceId=`**: resource không thuộc stack → HTTP 400 → trình duyệt log `console.error` → E2E fail (development.md › Traps, 7 #14). User chốt 2026-11-19.

**`StackLink`** (`web/src/shared/StackLink.tsx`, user đổi chốt 2026-11-22: đặt ở `shared`; import `useResourceIndex` và route stack từ `services/cloudformation`, SDK vẫn nạp lười trong `queryFn` nên không vào bundle chính): nhận `type` và `physicalId`, tra index, render "Stack: <link>" hoặc `null` (không thuộc stack, đang tải, lỗi).

| Trang                                 | Type                             | Physical ID truyền vào               |
| ------------------------------------- | -------------------------------- | ------------------------------------ |
| `s3/pages/BucketDetail.tsx`           | `AWS::S3::Bucket`                | tên bucket                           |
| `lambda/pages/FunctionDetail.tsx`     | `AWS::Lambda::Function`          | tên function                         |
| `dynamodb/pages/TableDetail.tsx`      | `AWS::DynamoDB::Table`           | tên bảng                             |
| `sqs/pages/QueueDetail.tsx`           | `AWS::SQS::Queue`                | `queue.url` (chuẩn hóa ra tên)       |
| `elasticache/pages/ClusterDetail.tsx` | `AWS::ElastiCache::CacheCluster` | cluster id; chỉ khi là cache cluster |

- Đặt trong description của `Header`. Description các trang này đang là chuỗi nối bằng `DETAIL_SEPARATOR` → đổi sang ReactNode (giữ dấu phân cách).
- **MQ không đặt**: `AWS::AmazonMQ::Broker` luôn bị Floci stub (7 #5).
- Thêm `StackLink` (một dòng mỗi trang, cùng cách) khi các service đó vào `main`: SNS (chi tiết topic), Cognito (chi tiết pool), EventBridge (chi tiết rule, chi tiết schedule), API Gateway (chi tiết API), Secrets Manager (chi tiết secret), Parameter Store (chi tiết parameter), CloudWatch Logs (chi tiết log group), Step Functions (chi tiết state machine), RDS (chi tiết DB), EC2 (chi tiết instance). SES không có trang chi tiết nên không đặt. Service nào vào `main` sau thì làm phần nối này.

### 3.9 Nhóm status

| Nhóm        | Status                                                                                       | `StatusIndicator` |
| ----------- | -------------------------------------------------------------------------------------------- | ----------------- |
| In progress | `*_IN_PROGRESS` (kể cả `REVIEW_IN_PROGRESS`, `*_CLEANUP_IN_PROGRESS`)                        | in-progress       |
| Failed      | `*_FAILED`, `ROLLBACK_COMPLETE`, `UPDATE_ROLLBACK_COMPLETE`, `IMPORT_ROLLBACK_COMPLETE`      | error             |
| Complete    | `CREATE_COMPLETE`, `UPDATE_COMPLETE`, `IMPORT_COMPLETE`, `DELETE_COMPLETE`, `DELETE_SKIPPED` | success           |

Map đủ enum của AWS dù Floci chỉ trả một phần (7 #8). Hàm thuần `statusGroup(status)` trong `status.ts`.

### 3.10 Link từ resource sang trang service

| Type                                                                                                                                                 | Physical ID (Floci 2.4.0)                 | Link                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `AWS::S3::Bucket`                                                                                                                                    | tên bucket                                | `s3Routes.bucket(id)`                                                      |
| `AWS::Lambda::Function`                                                                                                                              | tên function                              | `lambdaRoutes.function(id)`                                                |
| `AWS::Lambda::Url`                                                                                                                                   | ARN function                              | function (phần sau `function:`)                                            |
| `AWS::Logs::LogGroup`                                                                                                                                | tên                                       | `/aws/lambda/<fn>` → function, tab Monitor; còn lại text                   |
| `AWS::DynamoDB::Table`                                                                                                                               | tên bảng                                  | `dynamodbRoutes.table(id)`                                                 |
| `AWS::SQS::Queue`                                                                                                                                    | URL `http://localhost:4566/<acct>/<name>` | `sqsRoutes.queue(queueNameOfUrl(id))`                                      |
| `AWS::ElastiCache::CacheCluster`                                                                                                                     | cluster id                                | `elasticacheRoutes.cluster(id)`                                            |
| `AWS::CloudFormation::Stack`                                                                                                                         | ARN stack con                             | trang stack con (tên lấy từ ARN)                                           |
| `AWS::SNS::Topic`, `Subscription`                                                                                                                    | ARN topic; ARN subscription               | khi SNS vào `main`: trang topic (bỏ `:<uuid>` của subscription)            |
| `AWS::SES::EmailIdentity`                                                                                                                            | địa chỉ                                   | khi SES vào `main`: trang Identities                                       |
| `AWS::Cognito::UserPool`                                                                                                                             | pool id                                   | khi Cognito vào `main`: trang pool                                         |
| `AWS::Events::EventBus`                                                                                                                              | tên bus                                   | khi EventBridge vào `main`: trang Rules lọc theo bus                       |
| `AWS::ApiGateway::RestApi`, `AWS::ApiGatewayV2::Api`                                                                                                 | id                                        | khi API Gateway có trang                                                   |
| Resource bị stub, `Lambda::EventSourceMapping`, `Cognito::UserPoolClient`, `Events::Rule`, `Scheduler::Schedule`, IAM, Permission, policy, type khác | —                                         | text (physical ID không khớp thẳng route, phải gọi thêm API mới link được) |

Bảng map là một module thuần (`resourceLinks.ts`): **chỉ link khi physical ID khớp thẳng route** (cùng lắm tách chuỗi), không gọi thêm API. Thêm type khi service mới vào `main` chỉ là thêm một dòng.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác            | Gọi                                                              |
| ------------------- | ---------------------------------------------------------------- |
| Danh sách stack     | `DescribeStacks` (không tên)                                     |
| Chi tiết stack      | `DescribeStacks(StackName)` + `GetTemplateSummary` (description) |
| Events              | `DescribeStackEvents`                                            |
| Resources           | `ListStackResources` + `DescribeStackEvents` (reason, stub)      |
| Outputs             | `DescribeStacks`                                                 |
| Xóa                 | `DeleteStack` → poll `DescribeStacks`                            |
| Index cho StackLink | `DescribeStacks` + `ListStackResources` từng stack               |

Mọi list API đều viết vòng `NextToken` cho đúng chuẩn AWS dù Floci 2.4.0 trả hết một lần.

---

## 5. Trạng thái và lỗi

| Tình huống                                          | Hiển thị                                                  |
| --------------------------------------------------- | --------------------------------------------------------- |
| Stack không có (`ValidationError … does not exist`) | Trang chi tiết: "Stack … not found" kèm link về danh sách |
| Stack `REVIEW_IN_PROGRESS`                          | `Alert` info + empty state các tab (3.2)                  |
| Stack đang chạy                                     | Tự làm mới (3.1, 3.2)                                     |
| Resource bị stub                                    | `Alert` đầu trang + badge, không link (3.2, 3.4)          |
| Xóa stack còn bucket có object                      | Thông báo kèm reason (3.7)                                |
| `DELETE_FAILED` (bucket còn object)                 | Thông báo kèm reason, link sang bucket (3.7)              |
| Index lỗi                                           | `StackLink` ẩn; trang service không báo lỗi               |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-cloudformation -w web --min-release-age=7
```

`tests/` khi viết integration test: `npm install @aws-sdk/client-cloudformation -w tests --min-release-age=7`.

### Thay đổi ở compose

Thêm cho service `floci` trong `docker-compose.yml` (mục 9):

```yaml
environment:
  FLOCI_TLS_ENABLED: ${FLOCI_TLS_ENABLED:-false} # bật khi deploy app CDK có custom resource Node (development.md › Traps)
```

### Cấu trúc thư mục

```bash
web/src/services/cloudformation/
├── index.tsx, routes.ts, constants.ts       # STUB_REASON_MARKER, STACK_POLL_INTERVAL_MS, RESOURCE_INDEX_STALE_MS
├── status.ts                  # statusGroup(), isRunning() (không poll REVIEW_IN_PROGRESS), needsTls()
├── stacks.ts                  # gọi SDK: list, describe, events, resources, xóa; client
├── resourceLinks.ts           # type + physical ID → href (3.10)
├── resourceIndex.ts           # khóa và dựng index (thuần, 3.8)
├── stub.ts                    # gom logical ID bị stub từ events
├── hooks/
│   ├── useCloudFormation.ts   # client qua /aws, nạp lười
│   ├── useStacks.ts           # list, chi tiết, events, resources, template, xóa
│   └── useResourceIndex.ts    # index cho StackLink (3.8)
├── pages/                     # StackList, StackDetail
└── components/                # EventsTab, ResourcesTab, OutputsTab, DeleteStackModal, StackStatus
web/src/shared/StackLink.tsx   # dùng chung (3.8)
```

Khai báo trong `registry.ts` (một dòng, `navigation` có 1 mục); icon là glyph Tabler (`IconTemplate`) trên ô màu của nhóm `management` (thêm vào `SERVICE_CATEGORIES`), không có file svg. Repo đã có tiền lệ service import từ service khác (DynamoDB dùng route của Lambda), nên `resourceLinks.ts` import route của S3, Lambda, DynamoDB, SQS, ElastiCache và các trang đó import `StackLink`.

### Dùng lại từ phần đã có

| Thành phần                                                                                              | Dùng cho                    |
| ------------------------------------------------------------------------------------------------------- | --------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `ModalFooter`                                             | Header bảng, modal xóa      |
| `s3Routes`, `lambdaRoutes`, `dynamodbRoutes`, `sqsRoutes`, `elasticacheRoutes`, `queueNameOfUrl`        | Link resource (3.10)        |
| `CopyButton`, `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify`, `DETAIL_SEPARATOR` | Copy, trạng thái, thông báo |

### Đề xuất thêm vào development.md › Traps (user tự sửa)

- Stack `CREATE_COMPLETE` trên Floci chưa chắc deploy được trên AWS: resource bị stub, `Ref` tới parameter không khai báo thành chuỗi literal, `OnFailure` / `DisableRollback` / `RetainResources` bị bỏ qua.
- Xóa tay một resource do stack tạo: stack vẫn `CREATE_COMPLETE`. Tạo tay lại cùng tên rồi `DeleteStack` thì resource tạo tay bị xóa luôn.
- App CDK có custom resource Node (`autoDeleteObjects`, `BucketDeployment`, `AwsCustomResource`, `logRetention`, có thể cả `ec2.Vpc` với `restrictDefaultSecurityGroup`) deploy lên Floci mặc định lỗi `ECONNREFUSED …:443`. Chạy `FLOCI_TLS_ENABLED=true docker compose up`. Khi bật, URL Floci trả về (vd QueueUrl) thành `https://` với chứng chỉ tự ký (7 #20).
- `AWS::AmazonMQ::Broker` và `AWS::ElastiCache::ReplicationGroup` bị stub: stack thành công nhưng trang MQ / ElastiCache trống.

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1` (3 lượt khảo sát, hơn 150 stack thử, 239 resource type). Resource tạm đã xóa, kiểm còn 0; còn 2 KMS key ở `PendingDeletion` 7 ngày (KMS không cho xóa ngay).

| #   | Rủi ro                                                  | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tạo / update / xóa stack**                            | **Ổn.** `CreateStack` đồng bộ (chặn tới khi xong); resource tạo thật (đối chiếu API từng service). Update đổi property, thay resource, bỏ resource đều đúng. Update không đổi gì → `No updates are to be performed.`                                                                                                                                                                                                                                                                                                |
| 2   | **List / describe**                                     | Không phân trang ở mọi API (117 stack, 303 events một lần). `ListStacks` chỉ có tên, status, thời gian tạo; `DescribeStacks` có reason, `LastUpdatedTime`. Thiếu `Description`, `Output.Description`, `Capabilities`, `ParentId`                                                                                                                                                                                                                                                                                    |
| 3   | **Events**                                              | Có lý do lỗi đầy đủ, chuỗi rollback đúng. Timestamp nano giây, nhiều event cùng ms. Event đầu mọi stack là `REVIEW_IN_PROGRESS User Initiated`. Reason có thể nhiều dòng                                                                                                                                                                                                                                                                                                                                            |
| 4   | **Reason của resource**                                 | `ListStackResources` / `DescribeStackResources` không có `ResourceStatusReason`; `DescribeStackResource` (số ít) và events thì có                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | **Stub**                                                | Reason "Resource type X is not supported by Floci. It was stubbed and nothing was created for it." chỉ ở events / `DescribeStackResource`. Physical ID `<Logical>-<8hex>`, đổi sau mỗi update. Tài liệu và 2.4.0 lệch nhiều type (vd SES ConfigurationSet, EFS, `EC2::KeyPair`, `Cognito::UserPoolIdentityProvider` tài liệu ghi hỗ trợ nhưng bị stub; `Logs::SubscriptionFilter`, `SQS::QueueInlinePolicy`, `IAM::Group`, `Events::Connection`, `SecretsManager::RotationSchedule` bị stub) → badge dựa vào reason |
| 6   | **Luồng CDK (mô phỏng bằng API)**                       | **Ổn.** Bootstrap qua change set, asset lên S3, `TemplateURL` trỏ host AWS vẫn được Floci đọc từ S3 của nó, Lambda lấy code từ asset, update qua change set, deploy lại không đổi → change set `FAILED` "didn't contain changes". Execute **bất đồng bộ** → thấy `*_IN_PROGRESS`                                                                                                                                                                                                                                    |
| 7   | **`REVIEW_IN_PROGRESS`**                                | Có trong list; không Outputs / Parameters; resources rỗng; template `{}`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | **Status**                                              | Thấy thật: REVIEW_IN_PROGRESS, CREATE_* (CREATE_FAILED khi stack con lỗi, không rollback), ROLLBACK__, UPDATE__, UPDATE_ROLLBACK__, DELETE__ ; resource `DELETE_SKIPPED`. `OnFailure` bị bỏ qua (luôn `ROLLBACK_COMPLETE`)                                                                                                                                                                                                                                                                                          |
| 9   | **Resource sau rollback**                               | Vẫn liệt kê dòng `DELETE_COMPLETE`. Resource `CREATE_FAILED` không có physical ID                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | **Parameters, `Ref`**                                   | Parameter kiểu SSM không có `ResolvedValue`. `Ref` tới parameter không khai báo thành chuỗi literal, stack vẫn thành công                                                                                                                                                                                                                                                                                                                                                                                           |
| 11  | **Template**                                            | YAML: cả Original và Processed trả nguyên văn (giữ comment, `!Ref`). JSON nguyên văn. SAM transform: Processed là JSON đã mở rộng, logical ID khớp resources. Repo không có thư viện YAML                                                                                                                                                                                                                                                                                                                           |
| 12  | **Export / import**                                     | `Export` + `Fn::ImportValue` chạy; import tên không có → `CREATE_FAILED` rồi rollback. `ListExports` chạy; `ListImports` `UnknownAction`. **Xóa stack có export đang bị import vẫn thành công** (AWS chặn)                                                                                                                                                                                                                                                                                                          |
| 13  | **Nested stack**                                        | Chạy; tên con `<cha>-<Logical>`; physical ID của resource `AWS::CloudFormation::Stack` là ARN con. Stack cha chỉ ghi "Nested stack … rolled back"; nguyên nhân nằm ở events của con                                                                                                                                                                                                                                                                                                                                 |
| 14  | **Tra ngược theo physical ID**                          | `DescribeStackResources?PhysicalResourceId=` chạy nhưng: resource không thuộc stack → **HTTP 400**; tìm thấy thì trả cả stack (phải lọc type: `BucketPolicy` cùng ID với `Bucket`); stack đã xóa vẫn trả. → dùng index (3.8)                                                                                                                                                                                                                                                                                        |
| 15  | **Physical ID theo type**                               | Như bảng 3.10 (kiểm thật từng type). SQS URL luôn `localhost:4566` dù Host gọi là gì                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16  | **Xóa resource do stack quản lý**                       | Xóa tay queue / bảng: stack vẫn `CREATE_COMPLETE`; `DeleteStack` sau đó bỏ qua resource đã mất; **queue tạo tay lại cùng tên bị `DeleteStack` xóa luôn**. Bucket có object → `DELETE_FAILED`                                                                                                                                                                                                                                                                                                                        |
| 17  | **Drift, type registry**                                | `UnknownAction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 18  | **Persistence**                                         | **Ổn (đã restart thật 2026-11-19).** Stack (thành công, rollback, `REVIEW_IN_PROGRESS`, tạo qua change set), events, resources, template, exports, `ListStacks` giống hệt trước restart. Stack đã xóa (giữ 30 s) không lưu                                                                                                                                                                                                                                                                                          |
| 19  | **`DeletionPolicy: Retain`**                            | **Ổn.** Resource có `Retain` được giữ khi xóa stack, event `DELETE_SKIPPED` (bucket của CDK bootstrap). Khác với `RetainResources` của `DeleteStack` (bị bỏ qua)                                                                                                                                                                                                                                                                                                                                                    |
| 20  | **Custom resource Node của CDK**                        | **Lỗi mặc định.** Handler (`autoDeleteObjects`…) chạy xong nhưng gửi kết quả bằng `https.request` cổng 443, bỏ qua scheme / cổng của `ResponseURL` (`http://localhost.floci.io/cfn-response/…`) → `ECONNREFUSED …:443` → rollback. **Bật `FLOCI_TLS_ENABLED=true` thì chạy** (Floci mở thêm 443, inject `NODE_EXTRA_CA_CERTS` vào Lambda). Tác dụng phụ: URL Floci trả về thành `https://` (vd QueueUrl, physical ID của queue); HTTP cổng 4566 vẫn chạy song song                                                  |
| 21  | **`cdk deploy` thật (CDK CLI 2.1149.0, Floci bật TLS)** | **Ổn.** Bootstrap, deploy app có Lambda asset, SQS trigger, bucket `autoDeleteObjects`, nested stack, export, resource stub (`AWS::Glue::Database` nhận đúng qua reason); deploy lần 2 "no changes"; `cdk destroy` làm rỗng bucket rồi xóa hết. Không bật TLS: bootstrap ổn, deploy app có custom resource Node lỗi như #20                                                                                                                                                                                         |

**Chưa kiểm, kiểm khi làm:**

- Stack đang `*_IN_PROGRESS` lúc Floci restart.
- SDK v3 (query protocol) qua proxy `/aws`.
- Bundle sau khi nạp lười SDK CloudFormation.

---

## 8. Thứ tự làm

1. User cài package (mục 6). Sửa compose, README. Icon, khai báo trong `registry.ts`, `useCloudFormation` (nạp lười).
2. Hàm thuần + unit test: `status.ts`, `stub.ts`, `resourceLinks.ts`.
3. Danh sách stack: tìm, tự làm mới.
4. Chi tiết stack: header, cảnh báo stub, `REVIEW_IN_PROGRESS`, tab Events.
5. Tab Resources (link, badge), Outputs.
6. Xóa stack (`DELETE_FAILED`).
7. Index + `StackLink`; gắn vào 5 trang (đổi description sang ReactNode).
8. Test: integration `tests/it/cloudformation.test.ts` (stack có S3 / SQS / Lambda / stub / export → events, resources, references, index, xóa); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; stack `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`. Kiểm E2E các trang S3, Lambda, DynamoDB, SQS, ElastiCache vẫn không có `console.error`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang (logical / physical ID dài). Trọn luồng: `cdk deploy` app có bucket, queue, Lambda, bảng, một resource bị stub, output có export, một nested stack → danh sách thấy stack và stack con → chi tiết: cảnh báo stub, Events, Resources link sang bucket / queue / function / bảng, mở trang queue thấy "Stack: …" → update làm hỏng một resource → Events lọc lỗi thấy lý do, link sang stack con → xóa stack.

---

## 9. Quyết định

| Quyết định                                                                                                                                                                                                                                                                              | Lý do                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chỉ làm tính năng thỏa 3 tiêu chí, không làm đủ như AWS                                                                                                                                                                                                                                 | User chốt 2026-11-17, bổ sung 2026-11-19                                                                                                                                |
| Cắt tab Parameters, Template và cột References                                                                                                                                                                                                                                          | Không ảnh hưởng flow deploy (CDK CLI ↔ Floci); dev xem trong code / `cdk.out/`. User chốt 2026-11-19                                                                    |
| Không làm canvas                                                                                                                                                                                                                                                                        | User chốt 2026-11-19; References thay phần quan hệ                                                                                                                      |
| `StackLink` tra bằng index, không dùng `DescribeStackResources?PhysicalResourceId=`                                                                                                                                                                                                     | Tránh HTTP 400 làm E2E fail; 0 request thêm sau lần đầu. User chốt 2026-11-19                                                                                           |
| `StackLink` đặt ở `web/src/shared/StackLink.tsx` (đổi từ `services/cloudformation/components`)                                                                                                                                                                                          | Mọi trang chi tiết dùng chung một component. Đây là chỗ đầu tiên `shared` import từ `services`: chỉ import hook index (SDK nạp lười). User đổi chốt 2026-11-22          |
| Không đặt `StackLink` ở MQ                                                                                                                                                                                                                                                              | Broker luôn bị stub                                                                                                                                                     |
| Badge stub dựa vào reason trong events, không dựa danh sách type                                                                                                                                                                                                                        | Tài liệu và 2.4.0 lệch nhiều type; physical ID stub không ổn định                                                                                                       |
| Danh sách dùng `DescribeStacks`, không `ListStacks`                                                                                                                                                                                                                                     | `ListStacks` không có reason, `LastUpdatedTime`                                                                                                                         |
| Giữ thứ tự events của API                                                                                                                                                                                                                                                               | Nhiều event cùng ms                                                                                                                                                     |
| Làm đơn giản: dùng thẳng dữ liệu Floci trả, không viết thêm logic bù chỗ thiếu (không badge Nested / parent stack, không lọc theo nhóm status, không cảnh báo export bị import, không đọc description / construct path từ template, link resource chỉ khi physical ID khớp thẳng route) | User chốt 2026-11-19: chỉ tính năng thường dùng, có ích khi dev / test local                                                                                            |
| Mặc định mở tab Events                                                                                                                                                                                                                                                                  | Việc chính là xem deploy lỗi vì sao. User duyệt 2026-11-19                                                                                                              |
| Ẩn stack `DELETE_COMPLETE`                                                                                                                                                                                                                                                              | Lịch sử xóa ít dùng ở local. User duyệt 2026-11-19                                                                                                                      |
| TLS bật / tắt bằng biến môi trường, **mặc định tắt**: compose thêm `FLOCI_TLS_ENABLED: ${FLOCI_TLS_ENABLED:-false}` cho service `floci`; ai deploy app CDK có custom resource Node thì chạy `FLOCI_TLS_ENABLED=true docker compose up`                                                  | Không bật thì app CDK có custom resource Node không deploy được (7 #20); bật mặc định thì mọi URL Floci trả về thành `https://`. User duyệt 2026-11-19, xem lại khi làm |
| Không sửa server                                                                                                                                                                                                                                                                        | CloudFormation là AWS API thuần, đi qua proxy `/aws`                                                                                                                    |
