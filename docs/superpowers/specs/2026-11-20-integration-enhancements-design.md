# Tích hợp nâng cao: Lambda destination, trigger nâng cao, SES → SNS — Thiết kế

> Ngày: 2026-11-20 · Trạng thái: chờ duyệt · **Làm sau [EventBridge](2026-11-19-eventbridge-design.md)** (user chốt 2026-11-20) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · Mở rộng (không sửa): [Lambda](2026-11-09-lambda-design.md), [SQS](2026-11-17-sqs-design.md), [DynamoDB](2026-11-09-dynamodb-design.md), [SES](2026-11-17-ses-design.md)

## 1. Mục tiêu

Năm tích hợp AWS mà console chưa có, đã kiểm chạy thật trên Floci 2.4.0 (mục 7). Dev local dùng để test **đường lỗi** của các luồng nối service, thứ khó thử trên AWS thật:

1. **Lambda destination (async):** function chạy bất đồng bộ (S3, SNS, `InvocationType: Event`) xong thì gửi kết quả sang SQS / SNS / Lambda khác / event bus EventBridge, thành công và thất bại tách riêng.
2. **Filter criteria của trigger:** chỉ gọi function với message / record khớp pattern (tối đa 5 pattern, khớp một là đủ).
3. **Partial batch failure (SQS):** function báo message nào lỗi, chỉ message đó quay lại queue.
4. **Retry và đích lỗi của trigger stream (DynamoDB):** giới hạn số lần thử lại, record lỗi gửi sang SQS / SNS thay vì chặn cả shard.
5. **SES → SNS / EventBridge:** configuration set gửi event Send / Delivery / Bounce / Complaint sang SNS topic hoặc event bus; gắn làm mặc định cho identity để app **không phải sửa code**.

Đích EventBridge cần trang EventBridge (chọn bus, xem rule nhận event), nên spec này làm **sau** EventBridge và gồm luôn đích EventBridge.

Mọi thao tác gọi Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (roadmap mục 1, user chốt 2026-11-19): (1) dev thường dùng khi code, chạy local, test; hoặc (2) cần để nối với service khác; **và** Floci hỗ trợ (một phần cũng được).

### Làm trong đợt này

| Nhóm                     | Tính năng                                                                                                                                                                            | Lý do giữ                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Lambda › Configuration   | Khối **Asynchronous invocation**: số lần thử lại (0–2), tuổi tối đa của event (60–21600 giây), **đích khi thành công / thất bại** (SQS queue, SNS topic, Lambda function, event bus) | (2) nối Lambda → SQS/SNS/Lambda/EventBridge; test đường lỗi async      |
| Trigger SQS              | **Filter patterns** (JSON, 1–5 pattern); **Report batch item failures** (checkbox)                                                                                                   | (2) cấu hình hay dùng của trigger SQS                                  |
| Trigger DynamoDB stream  | **Filter patterns** (1–5); **số lần thử lại** (−1 = mãi mãi, 0–10000); **tuổi tối đa của record** (−1 hoặc 60–604800 giây); **đích khi lỗi** (SQS queue, SNS topic)                  | (2) record lỗi không chặn stream; xem record lỗi ở queue / topic       |
| Lambda › Triggers        | Nút **Edit** cho trigger SQS / DynamoDB: sửa batch size cùng các field trên (`UpdateEventSourceMapping`). Cột Details tóm tắt filter, partial batch, đích lỗi                        | Sửa pattern để thử lại là thao tác lặp lại nhiều khi test filter       |
| Add trigger (3 nơi)      | Field mới có ở modal Add trigger của Lambda, của trang queue SQS và của tab Settings bảng DynamoDB                                                                                   | Giữ ba nơi thêm trigger giống nhau (như hiện tại)                      |
| SES › Configuration sets | Trang mới: liệt kê, tạo, xóa; mỗi set có **event destination** SNS topic hoặc event bus (thêm, xóa, bật/tắt; chọn loại event)                                                        | (2) nối SES → SNS / EventBridge (roadmap: "SNS (bounce/complaint)")    |
| SES › Identities         | Cột **Configuration set** mặc định; hành động **Set configuration set** / gỡ (`PutEmailIdentityConfigurationSetAttributes`)                                                          | App gửi mail như cũ (không truyền `ConfigurationSetName`) vẫn có event |

### Làm sau

| Tính năng                                                                                       | Lý do                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| DLQ của function (`DeadLetterConfig`)                                                           | Floci chạy đúng (mục 7 #11) nhưng trùng việc với đích **On failure**; AWS khuyên dùng destination             |
| SES notification topic kiểu cũ (`SetIdentityNotificationTopic`, API v1)                         | Floci chạy đúng (mục 7 #12) nhưng trùng việc với configuration set mặc định (#10), cũng không phải sửa code   |
| ~~Trang SQS / SNS / Lambda hiện "ai đang gửi vào đây"~~ | **Đã làm 2026-11-21** (khối "Other senders": S3 notification, Lambda async / đích lỗi trigger, SES; trang bus hiện Lambda + SES). Quét ở trình duyệt khi mở trang, ẩn khi rỗng |

### Không làm

| Tính năng                                                                 | Lý do                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Event Open / Click / Rendering failure / Subscription của SES             | Cần mail client thật mở mail; local không có                            |
| Event Reject, Delivery delay của SES                                      | Floci không phát (mục 7 #15)                                            |
| Đích CloudWatch, Firehose, Pinpoint của SES                               | Ngoài phạm vi console (roadmap: không làm Firehose; CloudWatch Metrics) |
| Bisect batch on error, tumbling window, parallelization factor của stream | Tinh chỉnh thông lượng, không phải luồng dev test ở local               |

---

## 3. Màn hình

### 3.1 Lambda › Configuration › Asynchronous invocation (khối mới, dưới Environment variables)

```text
┌ Asynchronous invocation ─────────────────────────────────────────── [Edit] [Remove] ┐
│ Retry attempts   Maximum event age   On success                On failure           │
│ 0                1h 0m 0s            SQS queue · orders-done    Event bus · default  │
│ Asynchronous calls only (S3, SNS, Test tab › Asynchronous). Sync calls ignore this.  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Chưa cấu hình: hiện mặc định của AWS (2 lần, 6 giờ, không có đích) và nút **Edit**.
- Đích là link sang trang queue / topic / function / event bus (`QueueLink`, `TopicLink`, `FunctionLink` có sẵn, tự hiện "(not found)" khi đích bị xóa; link bus dùng của spec EventBridge).
- **Edit (modal):** Retry attempts (0–2), Maximum event age (giây, 60–21600), On success và On failure: mỗi cái một `Select` loại đích (None / SQS queue / SNS topic / Lambda function / Event bus) + `Select` resource. Lưu → `PutFunctionEventInvokeConfig`.
- **Remove:** `DeleteFunctionEventInvokeConfig`, trở về mặc định. Modal xác nhận.
- Gợi ý ngay trong khối: thử bằng tab Test, chế độ **Asynchronous** (đã có).

### 3.2 Field mới của trigger (modal Add / Edit)

```text
SQS:       Batch size [10]   ☐ Report batch item failures
           Filter patterns (optional)  {"body": {"type": ["order"]}}       [Remove]
                                       {"body": {"type": ["refund"]}}      [Remove]
                                       [Add pattern]   (tối đa 5)
           ⚠ Messages that don't match any pattern are deleted from the queue without running the function.

DynamoDB:  Starting position [Latest]  Batch size [100]
           Retry attempts [-1]   Maximum record age (s) [-1]
           On failure  [None ▾ | SQS queue | SNS topic]  [resource ▾]
           Filter patterns (optional)  {"dynamodb": {"NewImage": {"status": {"S": ["failed"]}}}}
```

- Filter patterns: mỗi pattern một editor JSON dùng lại `ValueEditor` (đã có, kiểm JSON hợp lệ); **Add pattern** / **Remove**, tối đa 5 (giới hạn AWS). Khớp một pattern là đủ. Không có pattern = không lọc. Sửa trigger có sẵn nhiều pattern (tạo bằng IaC) thì hiện đủ, không làm mất pattern nào. Gợi ý cú pháp: một ví dụ ngắn trong `description`, link tài liệu AWS về filter.
- Report batch item failures: gợi ý function trả `{ batchItemFailures: [{ itemIdentifier: messageId }] }`.
- Modal **Edit** (Lambda › Triggers, chọn một trigger SQS / DynamoDB): cùng field, không đổi được nguồn (queue / bảng) hay starting position (AWS không cho).

### 3.3 Lambda › Triggers

- Thêm action **Edit** (bật khi chọn đúng một trigger SQS hoặc DynamoDB), cạnh Enable / Disable / Delete.
- Cột **Details** thêm tóm tắt, nối bằng `·`: `Batch size 10 · Filter · Partial batch` / `Batch size 100 · Latest · Retry 2 · On failure: SQS orders-dlq`.

### 3.4 SES › Configuration sets — `/ses/configuration-sets` (mục mới trên sidebar dưới SES)

```text
Configuration sets (2)                                     [↻] [Delete] [Create configuration set]
┌──────────────────┬──────────────────────────────────────┬──────────────────────┐
│ Name             │ Event destinations                   │ Used by (identities) │
├──────────────────┼──────────────────────────────────────┼──────────────────────┤
│ ◯ app-events     │ to-sns → SNS mail-events (3 types)   │ noreply@app.local    │
└──────────────────┴──────────────────────────────────────┴──────────────────────┘
```

- **Create:** tên (theo luật AWS: chữ, số, `-`, `_`, tối đa 64). Tạo xong mở panel của set đó.
- **Panel (split panel, như Templates):** danh sách event destination; **Add destination** (modal): tên, loại event (`Multiselect`: Send, Delivery, Bounce, Complaint: bốn loại Floci phát), đích (`Tiles`: SNS topic / Event bus (chỉ bus `default`: SES không nhận bus khác), rồi `Select` resource, link "Create a topic" / "Create an event bus"); bật / tắt; xóa. Destination tạo ngoài console có loại khác (Reject…) vẫn hiện đúng.
- Gợi ý trong panel: gửi tới `success@simulator.amazonses.com` để nhận Delivery, `bounce@simulator.amazonses.com` (hoặc `suppressionlist@`) để nhận Bounce, `complaint@simulator.amazonses.com` để nhận Complaint. Đích event bus: event có `source: "aws.ses"`, `detail-type: "Email Sent"`…, tạo rule theo `source` để bắt.
- Cột "Used by": identity nào đang dùng set làm mặc định (đọc từ `GetEmailIdentity` đã gọi ở trang Identities, không gọi thêm).
- Xóa set đang được identity dùng: cảnh báo trong modal xóa.

### 3.5 SES › Identities

- Cột **Configuration set** (mặc định của identity, link sang set; "—" nếu không có).
- Action **Set configuration set** (chọn một identity): modal `Select` set (có lựa chọn None để gỡ) → `PutEmailIdentityConfigurationSetAttributes`.

---

## 4. Cách hoạt động

| Thao tác                       | API                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đọc / lưu / xóa cấu hình async | `GetFunctionEventInvokeConfig` (404 = chưa cấu hình) · `PutFunctionEventInvokeConfig` · `DeleteFunctionEventInvokeConfig`                                                                 |
| Thêm / sửa trigger             | `CreateEventSourceMapping` / `UpdateEventSourceMapping` với `FilterCriteria`, `FunctionResponseTypes`, `MaximumRetryAttempts`, `MaximumRecordAgeInSeconds`, `DestinationConfig.OnFailure` |
| Gỡ filter                      | `UpdateEventSourceMapping` với `FilterCriteria: { Filters: [] }` (đã kiểm: Floci xóa filter)                                                                                              |
| Configuration set              | `ListConfigurationSets`, `CreateConfigurationSet`, `DeleteConfigurationSet`, `Get/Create/Update/DeleteConfigurationSetEventDestination` (`SnsDestination` hoặc `EventBridgeDestination`)  |
| Set mặc định cho identity      | `PutEmailIdentityConfigurationSetAttributes` (không có `ConfigurationSetName` = gỡ)                                                                                                       |

- `GetFunctionEventInvokeConfig` trả 404 khi chưa cấu hình: kiểm `ListFunctionEventInvokeConfigs` trước (trả 200, rỗng) để trình duyệt không ghi `console.error` (development.md › Traps: E2E fail khi có `console.error`).
- Chọn đích bằng dropdown resource có sẵn (queue, topic, function, bus), không nhập ARN tay; ARN dựng từ resource đã chọn như các modal hiện có.

---

## 5. Trạng thái và lỗi

| Tình huống                                          | Hiển thị                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter pattern không phải JSON                      | Lỗi tại field (schema zod), không gọi API                                                                                                      |
| Pattern sai cú pháp filter (JSON hợp lệ)            | Lỗi Floci trả về trong Flashbar ("Couldn't save the trigger": Floci kiểm cú pháp, vd `Filter Pattern field 'type' must be an array or object`) |
| Đích async / đích lỗi đã bị xóa                     | Link hiện "(not found)" (component có sẵn)                                                                                                     |
| Xóa configuration set đang là mặc định của identity | Cảnh báo trong modal xóa, liệt kê identity                                                                                                     |
| Trigger SQS có filter                               | Cảnh báo cố định dưới field: message không khớp bị xóa khỏi queue                                                                              |
| Hơn 5 pattern                                       | Ẩn nút Add pattern khi đủ 5                                                                                                                    |

---

## 6. Kỹ thuật

- **Không thêm package.** `@aws-sdk/client-lambda`, `client-sesv2`, `client-sqs`, `client-sns` đã có; client EventBridge do spec EventBridge thêm.
- File chính:
  - `web/src/services/lambda/components/ConfigurationTab.tsx` (khối mới) + `AsyncInvocationModal.tsx` (mới); hook trong `hooks/useFunctions.ts` hoặc `hooks/useAsyncConfig.ts` (mới).
  - `web/src/services/lambda/components/AddTriggerModal.tsx`, `TriggersTab.tsx` (Edit), `hooks/useTriggers.ts` (update mapping, tóm tắt Details), `schemas.ts`.
  - `web/src/services/sqs/components/AddTriggerModal.tsx`, `web/src/services/dynamodb/components/SettingsModals.tsx`: dùng chung field mới qua một component `MappingOptionsFields` trong `lambda/components/` để ba modal không lặp code.
  - `web/src/services/ses/pages/ConfigurationSets.tsx` (mới, route `lazyPage`), `components/ConfigurationSetPanel.tsx`, `hooks/useConfigurationSets.ts`; sửa `pages/Identities.tsx`, `index.tsx` (navigation), `routes.ts`.
- Dùng lại: hook danh sách event bus của trang EventBridge, `ValueEditor` (JSON), `QueueLink` / `TopicLink` / `FunctionLink`, `ConfirmModal`, `pageState()`, `ActionBar`, `ResponsiveTable`, split panel như Templates.

---

## 7. Rủi ro đã kiểm tra

Chạy thật trên Floci 2.4.0, qua proxy `/aws` của console (2026-11-20).

| #   | Kiểm                                                 | Kết quả                                                                                                              |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Lambda destination → SQS (thành công và thất bại)    | **Ổn**: record `{version, requestContext, requestPayload, responsePayload}` tới queue                                |
| 2   | Lambda destination → SNS, → Lambda                   | **Ổn**: SNS → SQS nhận record; function đích được gọi                                                                |
| 3   | Get / Delete cấu hình async                          | **Ổn**: Get trả retry, age, đích; Delete về mặc định                                                                 |
| 4   | Filter criteria trên trigger SQS                     | **Ổn**: chỉ message khớp gọi function. **Message không khớp bị xóa khỏi queue** (giống AWS)                          |
| 5   | Sửa / gỡ filter, bật / tắt partial batch bằng Update | **Ổn**: `FilterCriteria: { Filters: [] }` gỡ filter                                                                  |
| 6   | Report batch item failures                           | **Ổn**: lần gọi lại chỉ có message báo lỗi                                                                           |
| 7   | Stream: retry giới hạn + đích lỗi → SQS, → SNS       | **Ổn**: record `condition: "RetryAttemptsExhausted"` tới queue / topic                                               |
| 8   | Sửa retry / record age của trigger stream            | **Ổn**                                                                                                               |
| 9   | Configuration set + event destination SNS            | **Ổn**: event Send, Delivery, Bounce (gửi tới `bounce@simulator.amazonses.com`) qua SNS tới SQS                      |
| 10  | Configuration set mặc định của identity              | **Ổn**: gửi mail **không** truyền `ConfigurationSetName` vẫn ra event Send, Delivery                                 |
| 11  | `DeadLetterConfig` của function                      | **Ổn**: retry 0, gọi async lỗi → payload gốc tới SQS DLQ (lần kiểm trước chờ chưa hết retry backoff)                 |
| 12  | `SetIdentityNotificationTopic` (SES v1)              | **Ổn**: gửi tới `bounce@simulator…` → `{notificationType: "Bounce"}` tới topic                                       |
| 13  | Function chưa cấu hình async                         | `GetFunctionEventInvokeConfig` trả 404; `ListFunctionEventInvokeConfigs` trả 200 với mảng rỗng (dùng cái này để đọc) |
| 14  | Hai filter pattern trên trigger SQS                  | **Ổn**: message khớp một trong hai pattern gọi function; không khớp cái nào thì bỏ                                   |
| 15  | Event Complaint, Reject, Delivery delay của SES      | Complaint **ổn** (`complaint@simulator…`). `suppressionlist@` ra Bounce (như AWS). Không có Reject, Delivery delay   |
| 16  | Filter trên trigger DynamoDB stream                  | **Ổn**: chỉ record khớp gọi function. Trigger `LATEST` mới tạo cần vài giây mới nhận record (ghi ngay thì lỡ)        |
| 17  | Pattern sai cú pháp / không phải JSON                | Floci từ chối khi tạo trigger (`InvalidParameterValueException`), không lưu                                          |
| 18  | Lambda destination → event bus `default`             | **Ổn**: rule `source: ["lambda"]` → SQS nhận event `detail-type: "Lambda Function Invocation Result - Success"`      |
| 19  | SES event destination → event bus                    | **Ổn**: tạo được; rule `source: ["aws.ses"]` → SQS nhận event `detail-type: "Email Sent"`                            |

---

## 8. Thứ tự làm

Bắt đầu khi trang EventBridge đã xong (cần danh sách bus và link bus).

1. Trigger: `MappingOptionsFields`, Add (3 modal), **Edit** ở Lambda › Triggers, tóm tắt Details. Filter 1–5 pattern + partial batch (SQS), retry / record age / đích lỗi (DynamoDB).
2. Lambda › Configuration › Asynchronous invocation (khối + modal + Remove), đích gồm event bus.
3. SES › Configuration sets (trang, panel, event destination SNS / event bus) và cột / action ở Identities.
4. Test: unit cho schema (filter JSON, khoảng số, tối đa 5 pattern); IT cho luồng đích async (SQS, event bus), filter nhiều pattern, đích lỗi stream, SES → SNS / event bus (gọi thật qua `/aws`); một E2E cho mỗi nhóm 1–3.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: function lỗi gọi async → record ở queue đích; trigger có filter chỉ gọi với message khớp; trigger stream lỗi → record ở topic; app gửi mail không truyền configuration set → event tới queue qua topic.

---

## 9. Quyết định

| Quyết định                                                                     | Lý do                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Spec riêng, không sửa spec Lambda / SQS / DynamoDB / SES                       | User chốt 2026-11-20                                                    |
| Sửa trigger chỉ ở Lambda › Triggers; trang queue / bảng vẫn chỉ xem và thêm    | Giữ đúng quyết định của spec SQS / DynamoDB (bật/tắt, xóa làm ở Lambda) |
| Tối đa 5 filter pattern mỗi trigger                                            | Giới hạn AWS; Floci chạy đúng nhiều pattern (mục 7 #14)                 |
| Làm sau EventBridge, gồm đích EventBridge                                      | User chốt 2026-11-20; Floci chạy đúng (mục 7 #18–#19)                   |
| Đích chọn từ dropdown resource, không nhập ARN                                 | Như các modal nối service hiện có; ARN dựng từ resource                 |
| SES: configuration set + mặc định cho identity, chưa làm notification topic v1 | Một cách là đủ; configuration set làm được cả SNS lẫn EventBridge       |
| SES đích event bus chỉ chọn được bus `default` | Floci (và AWS) từ chối bus khác khi tạo destination; kiểm 2026-11-21 |
| Đích Event bus cho rule target (bus → bus), loại trừ chính bus của rule | Floci chuyển event sang bus khác (kiểm 2026-11-21: queue nhận 1 message) |
| Không làm SNS → SMS / email | Floci cho subscribe nhưng luôn để "pending confirmation" (token không xác nhận được), publish không vào hộp thư SMS hay SES (kiểm 2026-11-21): UI sẽ tạo subscription không bao giờ nhận gì |
| DLQ của function để sau                                                        | Đích On failure làm cùng việc, AWS khuyên dùng                          |
