# Step Functions — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã duyệt (2026-11-19) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 3

## 1. Mục tiêu

Màn hình Step Functions **đủ dùng** (user chốt 2026-11-19) cho workflow mà CDK deploy lên Floci. Dev local dùng để:

- Chạy thử một workflow với input tùy ý.
- Xem lần chạy tới đâu, **bước nào lỗi và vì sao**, input / output từng bước.
- Từ bước Task đi sang Lambda, queue, bảng… đã gọi.
- Dừng một lần chạy bị treo.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.** Đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác, **và** (3) Floci hỗ trợ. Chỉ tính năng thường dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console. Step Functions: **chỉ làm đủ dùng**.

### Làm trong đợt này

| Nhóm               | Tính năng                                                                                       | Tiêu chí        | Floci 2.4.0                           |
| ------------------ | ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------- |
| Danh sách          | State machine: tên, type (Standard / Express), ngày tạo                                         | (1)             | Toàn phần                             |
| Chi tiết           | Tab **Executions** (lọc status), tab **Definition** (code, chỉ đọc)                             | (1)             | Toàn phần                             |
| Start execution    | Tên (tùy chọn), input JSON                                                                      | (1)             | Toàn phần (Express cũng xem lại được) |
| Chi tiết execution | Status, input, output, lỗi; **bảng từng bước** (state, type, status, thời gian, input / output) | (1)             | Toàn phần (`GetExecutionHistory`)     |
| Stop execution     | Dừng execution đang chạy                                                                        | (1) (user chốt) | Toàn phần                             |
| Liên kết           | Bước Task link sang Lambda / SQS / SNS / DynamoDB / state machine con; `StackLink`              | (2)             | Toàn phần                             |

### Để sau

| Tính năng                                      | Ghi chú                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Graph view                                     | Cần thư viện vẽ graph; bảng từng bước đủ để biết bước nào lỗi  |
| Tạo / sửa state machine (Workflow Studio)      | Workflow viết trong CDK; sửa trên console bị deploy sau ghi đè |
| Versions, aliases, activities, tag             | Đoán ít dùng; activity bị stub trong CloudFormation (7 #6)     |
| Gửi task token (`SendTaskSuccess` / `Failure`) | AWS Console cũng không có                                      |

### Không làm

| Tính năng          | Lý do                                        |
| ------------------ | -------------------------------------------- |
| Logging            | Floci chỉ lưu cấu hình, không ghi log (7 #5) |
| Redrive, TestState | Floci 2.4.0 `UnsupportedOperation`           |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: **State machines**.

### 3.1 Danh sách — `/stepfunctions/statemachines`

```text
State machines (2)                                              [↻]
[🔍 Find state machines by name   ]
 Name ▲                 Type        Created
 OrderWorkflow          Standard    2026-11-19 09:12
 QuickCheck             Express     2026-11-19 08:40
```

- `ListStateMachines` (vòng `nextToken`). Bấm tên mở chi tiết. Đường dẫn dùng tên; ARN ghép từ region, account, tên.

### 3.2 Chi tiết state machine — `/stepfunctions/statemachines/:name`

```text
OrderWorkflow                                              [Start execution]
Standard · Created 2026-11-19 09:12                    Stack: OrderStack ↗
[Executions] [Definition]

Executions (3)                          [Status: All ▾]  [↻]
 Name                                   Status        Started            Duration
 9f1c…                                  ✕ Failed      2026-11-19 09:30   1.2 s
 run-42                                 ✓ Succeeded   2026-11-19 09:20   3.4 s
 7a2b…                                  ◔ Running     2026-11-19 09:31   —
```

- `DescribeStateMachine` (type, `creationDate`, `definition`).
- **Executions:** `ListExecutions` (`statusFilter`, vòng `nextToken`). Status: `StatusIndicator`. Tự làm mới mỗi `EXECUTION_POLL_INTERVAL_MS` khi có execution `RUNNING`. Bấm tên mở 3.4.
- **Definition:** `definition` hiện bằng `CodeSnippet` (JSON format thụt 2 dấu cách; không parse được thì nguyên văn).
- Tab lưu trên URL (`?tab=`), mặc định Executions.
- `StackLink` type `AWS::StepFunctions::StateMachine`, physical ID = ARN.

### 3.3 Start execution (modal)

| Trường | Ghi chú                                                  |
| ------ | -------------------------------------------------------- |
| Name   | Tùy chọn (bỏ trống → Floci sinh UUID). 1–80 ký tự        |
| Input  | `CodeEditor` JSON, mặc định `{}`. JSON sai → chặn ở form |

`StartExecution` (cả Standard lẫn Express). Chạy xong mở 3.4 của execution vừa tạo.

### 3.4 Chi tiết execution — `/stepfunctions/execution?arn=`

```text
run-42                                                        [Stop execution]
◔ Running · OrderWorkflow ↗ · Started 2026-11-19 09:31
┌ Input ─────────────┐ ┌ Output ─────────────┐
│ { "orderId": 42 }  │ │ —                    │
└────────────────────┘ └──────────────────────┘
Steps (4)                                                        [↻]
 Step              Type      Status        Started     Duration   Resource
 ValidateOrder     Task      ✓ Succeeded   09:31:00    0.4 s      Lambda › validate-order ↗
 CheckStock        Choice    ✓ Succeeded   09:31:00    0.0 s      —
 ReserveStock      Task      ✕ Failed      09:31:01    0.8 s      DynamoDB › stock ↗
 NotifyFailure     Task      ◔ Running     09:31:02    —          SQS › alerts ↗
```

- ARN execution đưa vào query string (`?arn=`): ARN có `:`, Express có dạng riêng (`…:express:<sm>:<uuid>:<uuid>`).
- `DescribeExecution`: status, `startDate`, `stopDate`, `input`, `output`, `error`, `cause`. Failed: `Alert` error với `error` + `cause`.
- **Stop execution** (chỉ khi `RUNNING`): `ConfirmModal` → `StopExecution`. Execution thành `ABORTED`.
- Tự làm mới mỗi `EXECUTION_POLL_INTERVAL_MS` khi `RUNNING`.
- **Bảng Steps** (giống Table view của AWS): hàm thuần `steps.ts` gom `GetExecutionHistory` (vòng `nextToken`) thành cây dòng:
  - Mỗi lần vào state (`<Type>StateEntered` … `<Type>StateExited`) là một dòng: tên state, type, thời gian bắt đầu, duration, resource.
  - **Status** của dòng (giống AWS): có Exited và lần thử cuối thành công → **Succeeded** (kể cả đã Retry); có Exited nhưng lần thử cuối lỗi (Catch chuyển sang bước khác) → **Caught error**; chưa Exited mà execution còn `RUNNING` → **Running**; chưa Exited mà execution đã kết thúc → theo status execution (**Failed** / **Aborted** / **Timed out**).
  - **Map / Parallel:** dùng `expandableRows` của Cloudscape: dòng Map có dòng con "Iteration #i" (theo `MapIterationStarted.index`), dòng Parallel có dòng con "Branch #i"; bước bên trong nằm dưới vòng / nhánh của nó.
  - **Bấm một dòng** → split panel (`useSplitPanel`, giống SQS Messages, ElastiCache Keys): input, output (`CodeSnippet`), và `error` + `cause` nếu có. Bảng không hiện chi tiết dưới dòng.
- **Resource** của bước Task (3.5).

### 3.5 Link resource của bước Task

Lấy từ event `TaskScheduled` (`resourceType`, `resource`, `parameters`) hoặc `LambdaFunctionScheduled` (`resource` = ARN):

| Đích                                   | Lấy tên từ                            | Link                             |
| -------------------------------------- | ------------------------------------- | -------------------------------- |
| Lambda                                 | `FunctionName` trong parameters / ARN | `lambdaRoutes.function(tên)`     |
| SQS                                    | `QueueUrl` → `queueNameOfUrl`         | `sqsRoutes.queue(tên)`           |
| DynamoDB                               | `TableName`                           | `dynamodbRoutes.table(tên)`      |
| SNS                                    | `TopicArn`                            | trang topic (khi SNS vào `main`) |
| Step Functions (lồng)                  | `StateMachineArn`                     | 3.2 của state machine con        |
| Khác (`aws-sdk:*`, EventBridge, HTTP…) | —                                     | text `<resourceType>:<resource>` |

Giá trị có `.$` (lấy từ input lúc chạy) đọc từ `parameters` đã resolve trong event; không có thì text.

### 3.6 Liên kết từ service khác

Service nào vào `main` sau thì làm phần này:

| Chỗ                                  | Đổi                                                            |
| ------------------------------------ | -------------------------------------------------------------- |
| EventBridge (target rule / schedule) | ARN state machine → link 3.2 (spec EventBridge đang hiện text) |
| API Gateway (integration `states`)   | Giữ URI nguyên văn (spec API Gateway không đoán đích)          |
| CloudFormation `resourceLinks.ts`    | `AWS::StepFunctions::StateMachine` (ARN) → 3.2                 |

---

## 4. Cách hoạt động của một số thao tác

| Thao tác           | Gọi                                         |
| ------------------ | ------------------------------------------- |
| Danh sách          | `ListStateMachines`                         |
| Chi tiết           | `DescribeStateMachine` + `ListExecutions`   |
| Start              | `StartExecution`                            |
| Chi tiết execution | `DescribeExecution` + `GetExecutionHistory` |
| Stop               | `StopExecution`                             |

---

## 5. Trạng thái và lỗi

| Tình huống                         | Hiển thị                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| State machine / execution không có | "… not found" kèm link về danh sách                                                            |
| Input không phải JSON              | Chặn ở form                                                                                    |
| Execution Failed                   | `Alert` với `error` + `cause`; bước lỗi hiện Failed / Caught error, chi tiết trong split panel |
| Wait / Retry dài                   | Floci cắt tối đa 30 s (7 #3); không hiện thời gian còn lại                                     |

---

## 6. Kỹ thuật

### Package cần cài

`@aws-sdk/client-sfn` (spec EventBridge cũng cài, dùng chung). Nếu chưa có, user tự chạy:

```bash
npm install @aws-sdk/client-sfn -w web --min-release-age=7
```

### Cấu trúc thư mục

```bash
web/src/services/stepfunctions/
├── index.tsx, routes.ts, constants.ts      # EXECUTION_POLL_INTERVAL_MS
├── steps.ts                   # gom history thành bảng bước (3.4)
├── taskResource.ts            # resource của bước Task → loại, tên, link (3.5)
├── hooks/                     # useSFN (client), useStateMachines, useExecutions (list, describe, history, start, stop)
├── pages/                     # StateMachineList, StateMachineDetail, ExecutionDetail
└── components/                # ExecutionsTab, DefinitionTab, StartExecutionModal, StepsTable
```

Một dòng trong `registry.ts`; icon `web/public/icons/stepfunctions.svg`.

### Dùng lại từ phần đã có

| Thành phần                                                                          | Dùng cho                               |
| ----------------------------------------------------------------------------------- | -------------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `useZodForm`             | Bảng, modal                            |
| `CodeEditor`, `CodeSnippet`                                                         | Input, definition, input / output bước |
| `lambdaRoutes`, `sqsRoutes`, `queueNameOfUrl`, `dynamodbRoutes`                     | Link resource                          |
| `StackLink` (CloudFormation)                                                        | Chi tiết state machine                 |
| `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify`, `formatDate` | Trạng thái, thông báo                  |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`. Resource tạm đã xóa, kiểm còn 0.

| #   | Rủi ro               | Kết quả                                                                                                                                                                                                                                  |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **API chính**        | **Ổn.** Create / Describe / Update / Delete / List (phân trang), Validate; Start (có / không tên), StartSync (Express), Describe / List (lọc status) / Stop execution                                                                    |
| 2   | **History**          | **Ổn.** `GetExecutionHistory` đủ event từng state, có `id`, `previousEventId`, phân trang, `reverseOrder`                                                                                                                                |
| 3   | **State**            | Pass, Choice, Parallel, Map (inline, distributed), Succeed, Fail, Retry / Catch, JSONPath, JSONata chạy. **Wait / Retry bị cắt tối đa 30 s.** Biến `$x` trong JSONPath trả `null`                                                        |
| 4   | **Task integration** | Lambda (`lambda:invoke`, ARN trực tiếp, `waitForTaskToken`), SQS, SNS, DynamoDB, EventBridge `putEvents`, nested `.sync` / `.sync:2` **chạy thật**. `aws-sdk:*` chỉ một phần (`s3:getObject`, `lambda:invoke`… → `Unsupported resource`) |
| 5   | **Logging**          | `loggingConfiguration` chỉ lưu, không ghi log                                                                                                                                                                                            |
| 6   | **CloudFormation**   | `AWS::StepFunctions::StateMachine` tạo thật (cả `DefinitionSubstitutions`); Activity / Version / Alias bị stub. Tra ngược theo ARN ra đúng stack                                                                                         |
| 7   | **Nguồn kích hoạt**  | EventBridge rule, Scheduler (`at`, `rate`), S3 → EventBridge → state machine đều chạy. Execution phát event `Step Functions Execution Status Change`                                                                                     |
| 8   | **Express**          | `StartExecution` trên Express xem lại được bằng Describe / List / History (AWS không cho)                                                                                                                                                |
| 9   | **Không hỗ trợ**     | `TestState`, `RedriveExecution`, `DescribeStateMachineForExecution`, `ListMapRuns` → `UnsupportedOperation`                                                                                                                              |

**Chưa kiểm, kiểm khi làm:** SDK v3 qua proxy `/aws` (JSON 1.0 như DynamoDB); `parameters` trong `TaskScheduled` có chứa giá trị đã resolve (`.$`) không.

---

## 8. Thứ tự làm

1. Cài package nếu chưa có (mục 6). Icon, khai báo trong `registry.ts`, `useSFN`.
2. Hàm thuần + unit test: `steps.ts` (fixture history thật: thành công, lỗi có Catch, Map, Parallel, Aborted), `taskResource.ts`.
3. Danh sách, chi tiết (Executions, Definition), Start execution.
4. Chi tiết execution: input / output / lỗi, bảng Steps, link resource, Stop.
5. `StackLink` và dòng trong `resourceLinks.ts` (khi CloudFormation đã vào `main`); link từ EventBridge (khi EventBridge đã vào `main`).
6. Test: integration `tests/it/stepfunctions.test.ts` (Lambda → SQS → DynamoDB, lỗi + Catch, Stop); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; state machine `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: CDK deploy workflow Lambda → Choice → DynamoDB → SQS → danh sách thấy state machine, "Stack: …" → Start execution với input → execution Succeeded, bảng Steps đủ bước, link sang Lambda / bảng / queue → chạy với input làm bước DynamoDB lỗi → Failed, bấm bước lỗi thấy `error` + `cause` trong split panel; workflow có Retry + Catch → bước hiện Caught error, execution Succeeded → workflow có Wait 20 s → Stop execution → Aborted.

---

## 9. Quyết định

| Quyết định                                                               | Lý do                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Chỉ làm đủ dùng                                                          | User chốt 2026-11-19                                                |
| Giữ Stop execution                                                       | Dừng workflow treo khi test; một nút, một API. User chốt 2026-11-19 |
| Graph view, tạo / sửa, versions, aliases, activities để sau              | User chốt 2026-11-19                                                |
| Bảng từng bước gom từ history (giống Table view của AWS), không vẽ graph | Đủ biết bước nào lỗi, không thêm thư viện                           |
| ARN execution trong query string (`?arn=`)                               | ARN có `:`; Express có dạng riêng. User duyệt 2026-11-19            |
| Start xong mở thẳng chi tiết execution                                   | Giống AWS. User duyệt 2026-11-19                                    |
| Không sửa server                                                         | Step Functions là AWS API thuần, đi qua proxy `/aws`                |
