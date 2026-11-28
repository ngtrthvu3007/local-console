# EventBridge + Scheduler — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã làm (2026-11-21) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 2, làm sau [SQS](2026-11-17-sqs-design.md) và [SNS](2026-11-18-sns-design.md)

## 1. Mục tiêu

Làm màn hình EventBridge giống AWS EventBridge Console, gồm cả **EventBridge Scheduler**. Dev local dùng để:

- Xem rule nào bắt event nào và đẩy tới đâu (Lambda, SQS, SNS, Step Functions).
- Gửi event thử, kiểm event pattern có khớp không trước khi deploy.
- Tạo lịch chạy (cron job) gọi Lambda / SQS / SNS / event bus / Step Functions, thấy nó chạy thật ở local.
- Từ trang Lambda, SQS, SNS thấy rule / schedule nào đang đẩy vào.

**Một service** trên console (user chốt 2026-11-19), giống AWS Console: Scheduler nằm trong menu EventBridge. Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Đối chiếu với tài liệu [EventBridge](https://floci.io/floci/services/eventbridge/) và [Scheduler](https://floci.io/floci/services/scheduler/) của Floci và đã chạy thử trên Floci 2.4.0 (mục 7). Tài liệu Floci mô tả bản mới hơn 2.4.0, có chỗ 2.4.0 làm khác (mục 7 #8–#10).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác cho trọn flow, **và** (3) Floci hỗ trợ toàn phần hoặc một phần (một phần vẫn làm, ghi rõ chỗ thiếu). "Đã có trang console cho đích" chỉ là điều kiện phụ để xếp thứ tự.

### Làm trong đợt này

| Nhóm                 | Tính năng                                                                                             | Floci 2.4.0                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Event bus            | Liệt kê (`default` và custom), tạo, xóa custom bus                                                    | Toàn phần                                                     |
| Send events          | `PutEvents`: bus, source, detail-type, detail JSON                                                    | Toàn phần                                                     |
| Rule                 | Liệt kê theo bus, tạo, sửa, enable/disable, xóa nhiều                                                 | Toàn phần                                                     |
| Rule: event pattern  | JSON editor; **Test pattern** với event mẫu (Match / No match)                                        | Một phần: không có `numeric`, `wildcard`, so khớp mảng (7 #8) |
| Rule: chạy theo lịch | `rate()` / `cron()` trên rule                                                                         | Toàn phần (`rate` đã thấy chạy thật)                          |
| Rule: target         | Lambda, SQS (FIFO thì có message group ID), SNS, Step Functions; thêm, xóa                            | Toàn phần (Step Functions: chỉ ARN thường)                    |
| Schedule group       | Liệt kê (dạng bộ lọc), tạo, xóa (`default` không xóa được)                                            | Toàn phần                                                     |
| Schedule             | Liệt kê, tạo, sửa, enable/disable, xóa nhiều                                                          | Toàn phần, chạy thật                                          |
| Schedule: lịch       | `at()` / `rate()` / `cron()`, timezone, start / end, flexible time window, tự xóa sau khi chạy (`at`) | Một phần: flexible window lưu nhưng không jitter              |
| Schedule: target     | Lambda, SQS (FIFO thì có message group ID), SNS, event bus, Step Functions; Input                     | Toàn phần                                                     |
| Liên kết             | Lambda › Triggers, SQS › Settings, SNS › Details: rule / schedule đang đẩy vào                        | Một phần: không có `ListRuleNamesByTarget` (7 #9)             |

### Để sau

| Tính năng                                                         | Ghi chú                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Input / InputPath / input transformer cho target của rule         | Đoán dev ít dùng khi test tay; target nhận nguyên event là đủ |
| DLQ, retry policy của target (rule và schedule)                   | Đoán dev ít dùng; retry của Floci chỉ giữ trong bộ nhớ        |
| Archive, replay                                                   | Đoán dev ít dùng; Floci không mô tả hành vi                   |
| API destination, connection                                       | Đoán dev ít dùng                                              |
| Target event bus cho rule (chuyển tiếp bus → bus)                 | Đoán dev ít dùng; Floci chỉ chuyển một bước                   |
| Universal target của Scheduler (`sns:publish`, `sqs:sendMessage`) | Đoán dev ít dùng; đã có target SQS / SNS thường               |
| Tạo rule / schedule từ trang Lambda, SQS, SNS                     | Tạo ở trang EventBridge là đủ; các trang kia chỉ hiện (3.9)   |
| Tag                                                               | Ít dùng khi test tay                                          |

### Không làm

| Tính năng                                      | Lý do                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| Partner bus, bus policy, permission            | Dev local không dùng; policy chỉ áp dụng khi bật IAM enforcement |
| Schema registry, Pipes                         | Dev local không dùng                                             |
| Target ECS, Batch, Firehose, Redshift, AppSync | Ngoài phạm vi console ([roadmap](../roadmap.md) mục 5–6)         |
| `AddPermission` cho Lambda khi gắn target      | Floci không kiểm quyền; console không tạo policy giả (mục 9)     |

---

## 3. Màn hình

Theo quy tắc chung của DynamoDB, ElastiCache, MQ, SQS, SNS: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; cột số căn phải (`Figure`); thiếu giá trị là "—"; khung hẹp thì bảng thành hai tầng (`useIsCompact`); khối rỗng hoặc lỗi vẫn giữ khung.

Sidebar: **Event buses · Rules · Schedules**.

### 3.1 Event buses — `/eventbridge/buses`

```text
Event buses (2)                         [↻] [Delete] [Send events] [Create event bus]
 ☐ Name ▲             ARN
 ◯ default            arn:aws:events:ap-southeast-1:000000000000:event-bus/default
 ☐ orders             arn:aws:events:ap-southeast-1:000000000000:event-bus/orders
```

- `ListEventBuses`. Bấm tên mở trang Rules đã lọc theo bus đó.
- `default` không chọn được để xóa.
- **Delete (nhiều):** modal xác nhận gõ `delete`, liệt kê bus và số rule sẽ mất. Xóa luôn rule của bus (`RemoveTargets` → `DeleteRule` từng rule) rồi `DeleteEventBus`, giống xóa group (3.5).
- **Create event bus (modal):** Name (1–256 ký tự: chữ, số, `.`, `-`, `_`; không được là `default`). `CreateEventBus`.
- **Send events** mở modal 3.7.

### 3.2 Rules — `/eventbridge/rules?bus=`

```text
Rules (3)                                   [↻] [Actions ▾] [Create rule]
Event bus: [default ▾]
[🔍 Find rules by name           ]
 ☐ Name ▲              Type        State        Targets
 ☐ order-created       Pattern     ● Enabled          2
 ☐ nightly-report      Schedule    ● Enabled          1
 ☐ legacy-sync         Pattern     ○ Disabled         0
```

- `ListRules` (theo bus, phân trang), rồi `ListTargetsByRule` cho từng rule để đếm target.
- Bus lưu trên URL (`?bus=`, mặc định `default`). Đổi bus thì tải lại bảng.
- Type: có `EventPattern` là Pattern, có `ScheduleExpression` là Schedule.
- Actions (chọn dòng): **Enable**, **Disable**, **Delete** (nhiều).
- Khung hẹp: tầng 1 là tên + state, tầng 2 là type + số target.

### 3.3 Tạo / sửa rule — `/eventbridge/rules/create?bus=`, `/eventbridge/rules/:bus/:rule/edit`

| Trường        | Ghi chú                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Event bus     | `Select`. Khóa khi sửa                                                                                                        |
| Name          | 1–64 ký tự: chữ, số, `.`, `-`, `_`. Khóa khi sửa                                                                              |
| Description   | Tùy chọn                                                                                                                      |
| Rule type     | `Tiles`: Event pattern / Schedule. Schedule chỉ có trên bus `default` (luật của AWS)                                          |
| Event pattern | `CodeEditor` JSON. Không rỗng. Mặc định `{"source": ["my.app"]}`                                                              |
| Schedule      | Ô biểu thức `rate(...)` / `cron(...)`. Mô tả: "For new schedules, EventBridge Scheduler offers time zones and one-time runs." |
| State         | `Toggle` Enabled. Mặc định bật                                                                                                |

- Lưu bằng `PutRule` (cùng hàm cho tạo và sửa). Tạo xong mở trang chi tiết, tab Targets.
- **Sửa rule:** `PutRule` ghi đè cả rule, nên request = kết quả `DescribeRule` + các trường trong form; trường form không có (vd `RoleArn`) giữ nguyên. Target không bị ảnh hưởng (quản lý ở tab Targets).
- **Kiểm JSON ở form trước khi gửi**: Floci 2.4.0 nhận cả pattern không phải JSON (7 #10).
- `Alert` info dưới ô pattern: "Floci 2.4.0 does not match `numeric`, `wildcard`, or array values in events. These patterns never match locally."
- **Test pattern** (`ExpandableSection` dưới ô pattern): editor event mẫu (dev chỉ viết `source`, `detail-type`, `detail`; console tự thêm `id`, `account`, `time`, `region`, `resources` trước khi gọi `TestEventPattern`). Kết quả: `StatusIndicator` Match / No match.

### 3.4 Chi tiết rule — `/eventbridge/rules/:bus/:rule`

```text
order-created                                    [Delete] [Disable] [Edit]
Pattern · Enabled · bus default
[Targets] [Details]
```

- `StackLink` trong header: type `AWS::Events::Rule`, physical ID = tên rule ([spec CloudFormation](2026-11-19-cloudformation-design.md) 3.8; service nào vào `main` sau thì làm phần nối).
- Tab lưu trên URL (`?tab=`). **Mặc định mở Targets.**
- Rule không tồn tại: "Rule … not found" kèm link về danh sách.

**Tab Targets:**

```text
Targets (2)                                         [↻] [Remove] [Add target]
 ☐ Type             Resource
 ☐ Lambda           process-order
 ☐ SQS              orders-queue
```

- `ListTargetsByRule`. Resource hiện **tên** kèm link sang trang function / queue / topic. Step Functions hiện ARN dạng text khi chưa có trang; khi Step Functions vào `main` thì link `/stepfunctions/statemachines/:name` (service nào vào `main` sau thì làm). Target loại khác do IaC tạo (ECS, Kinesis, API destination…): Type "Other", hiện ARN dạng text, vẫn Remove được.
- **Add target (modal):** Type `Select` (Lambda / SQS / SNS / Step Functions) rồi dropdown resource tương ứng. Queue FIFO: thêm ô Message group ID (bắt buộc). Id target tự sinh. `PutTargets`.
- **Remove:** `RemoveTargets` (nhiều).

**Tab Details:** Name, ARN (copy được), bus, description, state, event pattern (`CodeEditor` chỉ đọc) hoặc schedule expression.

### 3.5 Schedules — `/eventbridge/schedules?group=`

```text
Schedules (2)                                  [↻] [Actions ▾] [Create schedule]
Group: [All groups ▾]                                   [Create group] [Delete group]
[🔍 Find schedules by name         ]
 ☐ Name ▲          Group      Target              State
 ☐ daily-report    default    Lambda report-fn    ● Enabled
 ☐ ping-queue      jobs       SQS ping-queue      ○ Disabled
```

- `ListSchedules` (phân trang, lọc `GroupName` khi chọn group). Target lấy từ `Target.Arn` trong kết quả (không phải gọi thêm). Biểu thức không có trong `ListSchedules`, nên không có cột biểu thức (mục 9).
- Group: `Select` có "All groups" và từng group (`ListScheduleGroups`), lưu trên URL.
- **Create group (modal):** Name. `CreateScheduleGroup`.
- **Delete group:** chỉ bật khi chọn một group khác `default`. Xóa group xóa luôn mọi schedule trong đó (Floci giống AWS), modal xác nhận liệt kê số schedule.
- Actions (chọn dòng): **Enable**, **Disable**, **Delete** (nhiều).
- Khung hẹp: tầng 1 là tên + state, tầng 2 là group + target.

### 3.6 Tạo / sửa schedule — `/eventbridge/schedules/create`, `/eventbridge/schedules/:group/:name/edit`

| Trường               | Ghi chú                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, Group          | Name 1–64 ký tự: chữ, số, `.`, `-`, `_`. Group `Select`, mặc định `default`. Cả hai khóa khi sửa                                             |
| Description          | Tùy chọn                                                                                                                                     |
| Schedule type        | `Tiles`: One-time (`at`) / Recurring: rate / Recurring: cron                                                                                 |
| One-time             | Ngày + giờ (`DatePicker`, `TimeInput`). Toggle **Delete after completion** (mặc định bật)                                                    |
| Rate                 | Số + đơn vị (minutes / hours / days)                                                                                                         |
| Cron                 | Ô biểu thức 6 trường. Mô tả: "Example: `0 9 ? * MON-FRI *` runs at 9:00 on weekdays."                                                        |
| Timezone             | `Select` có tìm kiếm. Mặc định timezone của trình duyệt. Áp dụng cho `at` và `cron`                                                          |
| Start / end          | Tùy chọn, chỉ cho Recurring                                                                                                                  |
| Flexible time window | `Tiles`: Off / Flexible (số phút). Mặc định Off. Mô tả: "Floci always fires on time."                                                        |
| Target               | Type `Select` (Lambda / SQS / SNS / Event bus / Step Functions) rồi dropdown resource. Queue FIFO: Message group ID bắt buộc                 |
| Input                | `CodeEditor`. Lambda, Step Functions, Event bus: phải là JSON (luật của Floci). SQS, SNS: text bất kỳ. Event bus: thêm Source và Detail type |
| State                | `Toggle` Enabled. Mặc định bật                                                                                                               |

- Tạo bằng `CreateSchedule`, sửa bằng `UpdateSchedule`. Tạo xong mở trang chi tiết.
- **Sửa schedule:** `UpdateSchedule` ghi đè cả schedule, nên request = kết quả `GetSchedule` + các trường trong form. Trường form không có (`RoleArn` thật, `RetryPolicy`, `DeadLetterConfig`, `KmsKeyArn`, tham số target lạ) **giữ nguyên**. Target loại form không biểu diễn được (ECS, Kinesis, universal target…): phần Target khóa, hiện ARN dạng text kèm mô tả "This target type can't be edited here."; các phần khác vẫn sửa được.
- `RoleArn` bắt buộc trong API: khi tạo, console tự điền role giả, dùng chung hằng số với Lambda (mục 9). Khi sửa thì giữ `RoleArn` cũ.
- Mô tả dưới Input: "Placeholders like `<aws.scheduler.scheduled-time>` are replaced on each run."

### 3.7 Send events (modal)

| Trường      | Ghi chú                                       |
| ----------- | --------------------------------------------- |
| Event bus   | `Select`, mặc định bus đang xem               |
| Source      | Bắt buộc, vd `my.app`                         |
| Detail type | Bắt buộc                                      |
| Detail      | `CodeEditor` JSON. Không rỗng, phải là object |

- `PutEvents` một entry. Thông báo kèm Event ID. Modal giữ nội dung để gửi tiếp.
- EventBridge không báo event đi tới target nào. Mô tả dưới header modal: "To check delivery, peek the target queues or open the function's Monitor tab."
- Mở từ trang Event buses và từ trang Rules (nút trong header).

### 3.8 Chi tiết schedule — `/eventbridge/schedules/:group/:name`

```text
daily-report                                     [Delete] [Disable] [Edit]
Recurring · cron(0 9 ? * MON-FRI *) · Asia/Ho_Chi_Minh · Enabled
```

| Khối     | Nội dung                                                                                      |
| -------- | --------------------------------------------------------------------------------------------- |
| Schedule | Biểu thức, timezone, start / end, flexible window, delete after completion, state, ARN (copy) |
| Target   | Type, resource (link sang trang function / queue / topic), Input (`CodeEditor` chỉ đọc)       |

- `StackLink` trong header: type `AWS::Scheduler::Schedule`, physical ID = tên schedule. Target Step Functions: link như 3.4 khi Step Functions vào `main`.

`GetSchedule`. Schedule không tồn tại (kể cả `at` đã chạy xong và tự xóa): "Schedule … not found. One-time schedules with Delete after completion are removed after they run." kèm link về danh sách.

### 3.9 Thay đổi ở Lambda, SQS, SNS, S3

| Chỗ                                   | Đổi                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lambda › tab Triggers                 | Thêm nguồn **EventBridge** (rule, link, kèm bus) và **Scheduler** (schedule, link) vào nhóm nguồn chỉ xem có sẵn trong code (`DISPLAY_ONLY_SOURCES`, `SOURCE_LABELS` ở `lambda/constants.ts`, như Kinesis). Chỉ hiện; không bật/tắt, không xóa ở đây                                                                 |
| SQS › tab Settings                    | Khối mới **EventBridge**: rule và schedule đang đẩy vào queue (link). Rỗng thì ẩn                                                                                                                                                                                                                                    |
| SNS › tab Details                     | Khối mới **EventBridge**: như SQS. Rỗng thì ẩn                                                                                                                                                                                                                                                                       |
| S3 › Properties › Event notifications | Dòng **Amazon EventBridge: On / Off** (`EventBridgeConfiguration` của bucket), `Toggle` giống AWS → `PutBucketNotificationConfiguration` giữ nguyên các notification khác. Floci chạy luồng S3 → EventBridge → rule (7 #13). Ghi lại notification đã giữ nguyên EventBridge (bug sửa 2026-11-19). Đề xuất của Claude |

Tìm theo ARN đích (một hook dùng chung, nằm trong service EventBridge):

- Rule: `ListEventBuses` → `ListRules` từng bus → `ListTargetsByRule` từng rule, lọc `Arn` (Floci 2.4.0 không có `ListRuleNamesByTarget`, 7 #9).
- Schedule: `ListSchedules`, lọc `Target.Arn`.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                  | Gọi                                                                               |
| ------------------------- | --------------------------------------------------------------------------------- |
| Danh sách bus             | `ListEventBuses`                                                                  |
| Danh sách rule            | `ListRules` (`EventBusName`) + `ListTargetsByRule` từng rule                      |
| Tạo / sửa rule            | `PutRule` (`EventPattern` hoặc `ScheduleExpression`, `State`)                     |
| Enable / disable rule     | `EnableRule` / `DisableRule`                                                      |
| Xóa rule                  | `RemoveTargets` (mọi target) rồi `DeleteRule` (AWS không cho xóa rule còn target) |
| Test pattern              | `TestEventPattern`                                                                |
| Send events               | `PutEvents`                                                                       |
| Danh sách schedule        | `ListSchedules` (`GroupName`) + `ListScheduleGroups`                              |
| Tạo / sửa schedule        | `CreateSchedule` / `UpdateSchedule`                                               |
| Enable / disable schedule | `GetSchedule` rồi `UpdateSchedule` với `State` mới (API không có lệnh riêng)      |
| Rule / schedule theo đích | 3.9                                                                               |

---

## 5. Trạng thái và lỗi

| Tình huống                          | Hiển thị                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Rule / schedule / bus không có      | Trang chi tiết: "… not found" kèm link về danh sách                              |
| Pattern không phải JSON             | Chặn ở form (Floci không chặn, 7 #10)                                            |
| Pattern dùng `numeric` / `wildcard` | `Alert` info trong form (3.3); Test pattern trả No match như khi chạy thật       |
| Biểu thức lịch sai                  | Lỗi gốc của Floci trong form (vd `ValidationException: Rate value must be >= 1`) |
| Event gửi tới bus không tồn tại     | Floci vẫn trả Event ID rồi bỏ event. Modal Send events chỉ cho chọn bus có thật  |
| Giao tới target lỗi                 | `PutEvents` vẫn thành công; Floci chỉ ghi WARN trong log. Mô tả ở modal 3.7      |
| `at` schedule đã chạy và tự xóa     | Trang chi tiết báo not found kèm giải thích (3.8)                                |
| Xóa group còn schedule              | Modal xác nhận liệt kê số schedule sẽ mất                                        |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-eventbridge @aws-sdk/client-scheduler @aws-sdk/client-sfn -w web --min-release-age=7
```

`tests/` cần thêm khi viết integration test: `npm install @aws-sdk/client-eventbridge @aws-sdk/client-scheduler -w tests --min-release-age=7`. `@aws-sdk/client-sns` có sẵn sau khi làm SNS.

### Cấu trúc thư mục

```bash
web/src/services/eventbridge/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── pattern.ts                 # kiểm JSON pattern; bọc event mẫu đủ trường cho TestEventPattern
├── scheduleExpression.ts      # dựng / tách at() / rate() / cron() từ các ô trong form
├── targets.ts                 # loại target theo ARN (Lambda / SQS / SNS / bus / Step Functions), tên hiển thị
├── hooks/
│   ├── useEventBridge.ts      # EventBridgeClient qua /aws
│   ├── useScheduler.ts        # SchedulerClient qua /aws
│   ├── useBuses.ts            # list, create, delete, put events
│   ├── useRules.ts            # list theo bus, get, put, enable/disable, delete, targets, test pattern
│   ├── useSchedules.ts        # list, groups, get, create, update, delete
│   └── useEventSources.ts     # rule / schedule theo ARN đích (3.9), Lambda / SQS / SNS dùng lại
├── pages/                     # BusList, RuleList, RuleForm, RuleDetail, ScheduleList, ScheduleForm, ScheduleDetail
└── components/                # TargetPicker, SendEventsModal, TestPatternSection, các modal
```

Khai báo trong `registry.ts` (một dòng, `navigation` có 3 mục); icon `web/public/icons/eventbridge.svg` theo cùng khung với các icon cũ. `TargetPicker` dùng chung cho rule và schedule.

### Dùng lại từ phần đã có

| Thành phần                                                                                    | Dùng cho                                        |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `ModalFooter`                                   | Header bảng, modal xác nhận                     |
| `FormModal`, `FormFields`, `useZodForm`                                                       | Form tạo bus, group, target, send events        |
| `CodeEditor`                                                                                  | Pattern, event mẫu, detail, Input               |
| `useFunctions` (Lambda), `useQueues` (SQS), danh sách topic (SNS), `QueueLink`                | Dropdown và link target                         |
| `DEFAULT_ROLE_ARN` (Lambda constants)                                                         | `RoleArn` của schedule và target Step Functions |
| `CopyButton`, `Figure`, `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify` | ARN, cột số, trạng thái, thông báo              |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`, gọi thẳng Floci (`localhost:4566`, JSON 1.1 cho EventBridge, REST JSON cho Scheduler). Resource tạm `lc-probe-eb-*` đã xóa, kiểm còn 0.

| #   | Rủi ro                                 | Kết quả                                                                                                                                                                                                                    |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Rule → SQS / SNS / Lambda**          | **Ổn.** Một `PutEvents`: queue nhận event, SNS chuyển xuống queue đã subscribe, Lambda chạy và nhận đúng event (tài liệu Floci không ghi rõ)                                                                               |
| 2   | **Rule → Step Functions**              | **Ổn.** Có execution mới sau `PutEvents`                                                                                                                                                                                   |
| 3   | **Custom bus**                         | **Ổn.** Tạo bus, rule trên bus, `PutEvents` với `EventBusName` giao tới target                                                                                                                                             |
| 4   | **Rule `rate(1 minute)`**              | **Ổn.** Chạy đúng 1 phút sau khi tạo, gửi `Scheduled Event` (`source: aws.events`)                                                                                                                                         |
| 5   | **Scheduler chạy thật**                | **Ổn.** `rate()` chạy lần đầu ngay (kiểm mỗi 10 giây); `Input` có placeholder `<aws.scheduler.schedule-arn>` được thay                                                                                                     |
| 6   | **`at()` + tự xóa, `cron` + timezone** | **Ổn.** `at` chạy rồi schedule bị xóa (`GetSchedule` 404). `cron(0 9 ? * MON-FRI *)`, `Asia/Ho_Chi_Minh`, flexible window lưu đúng (chưa chờ tới giờ chạy)                                                                 |
| 7   | **Pattern: toán tử chạy được**         | exact, nested, `prefix`, `suffix`, `anything-but` (một giá trị và danh sách), `exists` (true/false), `equals-ignore-case`, `$or`, `detail-type`                                                                            |
| 8   | **Pattern: toán tử hỏng**              | `numeric` (cả khoảng), `wildcard`, và giá trị mảng trong event (`tags: ["x","y"]` với pattern `["y"]`) **luôn No match**, cả `TestEventPattern` lẫn định tuyến thật. Tài liệu Floci nói `numeric` chạy → bản mới hơn 2.4.0 |
| 9   | **`ListRuleNamesByTarget`**            | **Không có** (`UnsupportedOperation`). Liên kết dùng `ListRules` + `ListTargetsByRule` (3.9)                                                                                                                               |
| 10  | **Pattern sai JSON**                   | `PutRule` nhận `{not json` và trả ARN → console phải tự kiểm                                                                                                                                                               |
| 11  | **`ListSchedules`**                    | Có `Target.Arn`, `GroupName`, `State`; không có biểu thức                                                                                                                                                                  |
| 12  | **Biểu thức Scheduler sai**            | `rate(0 minutes)` → 400 `ValidationException` rõ ràng                                                                                                                                                                      |
| 13  | **S3 → EventBridge**                   | **Ổn** (khảo sát Step Functions 2026-11-19): bucket bật EventBridge, upload object → rule `aws.s3` `Object Created` → target chạy                                                                                          |

**Chưa kiểm, kiểm khi làm:** SDK v3 qua proxy `/aws` (EventBridge là JSON như DynamoDB; Scheduler là REST như Lambda, cả hai kiểu đã chạy qua proxy); target SQS FIFO với message group ID; schedule target event bus; enable/disable schedule bằng `UpdateSchedule`; `cron` chạy đúng giờ theo timezone.

---

## 8. Thứ tự làm

0. **Làm sau khi SNS vào `main`** (SNS đã code xong, đang test, chưa push — 2026-11-19). Dùng lại hook danh sách topic, link topic và tab Details của SNS; `@aws-sdk/client-sns` có sẵn từ SNS.
1. User cài package (mục 6). Icon, khai báo trong `registry.ts`, `useEventBridge`, `useScheduler`.
2. Event buses: liệt kê, tạo, xóa; modal Send events.
3. Rules: danh sách theo bus, tạo / sửa (pattern, schedule), Test pattern, enable/disable, xóa.
4. Chi tiết rule: tab Targets (Lambda, SQS, SNS), tab Details.
5. Schedules: danh sách, group, tạo / sửa (`at`, `rate`, `cron`), chi tiết, enable/disable, xóa.
6. Liên kết: `useEventSources`, khối ở Lambda Triggers, SQS Settings, SNS Details.
7. Target Step Functions cho rule và schedule (cuối cùng: chưa có trang Step Functions, chỉ hiện ARN).
8. Test: unit cho `pattern.ts`, `scheduleExpression.ts`, `targets.ts` và schemas; integration `tests/it/eventbridge.test.ts` (rule → SQS / Lambda, rule rate, schedule → SQS, `at` tự xóa); E2E một luồng chính.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: tạo bus `orders` → rule pattern `{"source":["my.app"]}` → Test pattern Match / No match → target queue + Lambda → Send events → peek queue thấy event → log Lambda ở tab Monitor → tab Triggers của Lambda và Settings của queue hiện rule → tạo schedule `rate(1 minute)` đẩy vào queue → thấy message → tạo `at()` một phút sau, tự xóa sau khi chạy.

---

## 9. Quyết định

| Quyết định                                                                  | Lý do                                                                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Một service EventBridge, gồm cả Scheduler                                   | Giống AWS Console; dùng chung chọn target và liên kết. User chốt 2026-11-19                                                      |
| Chọn tính năng theo 3 tiêu chí (dev dùng / nối flow, Floci hỗ trợ)          | User chốt 2026-11-17, bổ sung 2026-11-19                                                                                         |
| Giữ rule chạy theo lịch dù đã có Scheduler                                  | CDK hay dùng `events.Rule` + `Schedule`; Floci chạy thật                                                                         |
| Target Step Functions làm cuối, hiện ARN dạng text                          | Floci hỗ trợ; chưa có trang Step Functions (điều kiện phụ chỉ để xếp thứ tự)                                                     |
| Không gọi `AddPermission` cho Lambda, tự điền `RoleArn` giả                 | Floci không kiểm IAM; dev deploy thật bằng IaC chứ không bằng console. User duyệt 2026-11-19                                     |
| Lambda / SQS / SNS chỉ hiện rule / schedule, không tạo hay xóa ở đó         | Một chỗ tạo cho đơn giản (giống SNS, DynamoDB stream); xóa target ở trang rule. User duyệt 2026-11-19                            |
| Schedule group làm bộ lọc trên trang Schedules, không có trang riêng        | Group chỉ có tên; sidebar giữ 3 mục. User duyệt 2026-11-19                                                                       |
| Danh sách schedule không có cột biểu thức                                   | `ListSchedules` không trả biểu thức; gọi `GetSchedule` từng dòng thì chậm. Biểu thức xem ở trang chi tiết. User duyệt 2026-11-19 |
| Sửa rule / schedule: gộp với dữ liệu hiện có, không dựng mới từ form        | Rule / schedule do IaC tạo có trường form không có (retry, DLQ, role thật); dựng mới sẽ âm thầm xóa chúng. User duyệt 2026-11-19 |
| Xóa bus thì xóa luôn rule của bus                                           | Giống xóa group; modal liệt kê số rule sẽ mất. User duyệt 2026-11-19                                                             |
| Test pattern tự bọc event mẫu                                               | `TestEventPattern` bắt đủ trường envelope; dev chỉ nên viết phần của mình. User duyệt 2026-11-19                                 |
| Bus `default` vẫn hiện trong bảng, checkbox khóa                            | Giống AWS; chọn nhầm bus `default` để xóa là lỗi dễ gặp. Làm khi code 2026-11-20                                                 |
| Xóa bus và xóa rule dùng chung một hàm (`rules.ts`)                         | Gỡ target rồi xóa rule một chỗ, tránh lệch giữa xóa bus và xóa rule. Làm khi code 2026-11-20                                     |
| State rule dùng ô tick "Enabled" thay Toggle                                | Repo chưa có `FormToggle`; một ô không đáng thêm component. Làm khi code 2026-11-20                                              |
| Test pattern reset kết quả khi pattern hoặc event mẫu đổi                   | Kết quả cũ dễ gây hiểu nhầm. Làm khi code 2026-11-20                                                                             |
| Ngày giờ của schedule `at` là một ô text, chưa có Start / End date          | Repo chưa có field date / time; Start / End do IaC tạo vẫn được giữ nguyên khi sửa. Làm khi code 2026-11-20                      |
| Lambda › Triggers: hàng rule / schedule không chọn được                     | Chỉ xem (3.9); bật / tắt / xóa ở trang EventBridge. Làm khi code 2026-11-20                                                      |
| Modal xóa queue / function / topic cảnh báo khi còn rule / schedule trỏ tới | Floci không dọn tham chiếu (README Traps); nối giữa các service. Đề xuất của Claude, làm khi code 2026-11-20                     |
| S3 › Event notifications: công tắc Amazon EventBridge (Toggle)              | Có trong 3.9 nhưng lần trước chưa làm; không có thì chỉ dùng UI không bật được S3 → EventBridge. Làm khi test flow 2026-11-20    |
| Hoãn target Step Functions (bước 7) tới khi có service Step Functions       | Chưa có service để tạo state machine, chỉ dán ARN thì không kiểm chứng được; làm cùng dropdown và link. User chốt 2026-11-21     |
| Không sửa server                                                            | EventBridge và Scheduler là AWS API thuần, đi qua proxy `/aws`                                                                   |
