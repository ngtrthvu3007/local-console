# CloudWatch Logs — Thiết kế

> Ngày: 2026-11-19, sửa lại 2026-11-26 · Trạng thái: **đã làm** (2026-11-26; bản sửa duyệt 2026-11-26) · Plan: [2026-11-26-cloudwatch-logs](../plans/2026-11-26-cloudwatch-logs.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4 (chuyển từ đợt 3 ngày 2026-11-23)

**Bản sửa 2026-11-26** (sau khi có thêm ECS, RDS, DocumentDB, ElastiCache, Amazon MQ, Kinesis):

- Tạo log group và sửa retention chuyển sang Làm (quy tắc "CRUD luôn làm").
- Subscription filter có thêm đích Kinesis.
- Thêm "Send test event".
- Thêm link hai chiều với các service đang ghi log.
- Tab log của task ECS dùng chung phần đọc log.
- `leftovers.mjs` dọn log group.
- Data viewer của Kinesis giải nén record của CloudWatch Logs.

Kiểm lại trên Floci 2.4.0 ở mục 7.

## 1. Mục tiêu

Làm trang CloudWatch Logs để xem **log của các service đang chạy trên Floci** ở một chỗ: Lambda, task ECS, RDS, DocumentDB, ElastiCache, Amazon MQ và log app tự ghi. Dev local dùng để:

- Tìm log bằng filter pattern trong một khoảng thời gian, tự làm mới khi đang test.
- Đi từ trang của service sang log của nó và ngược lại.
- Đẩy log sang Lambda hoặc Kinesis bằng **subscription filter** (Floci giao log thật).

Chỉ có log, **không làm Metrics / Alarm**: Floci 2.4.0 chỉ tự sinh metric cho SQS (mục 7 #9). User chốt 2026-11-26.

Phần đọc log đang có ở Lambda › Monitor và task ECS › Logs được **tách ra dùng chung**. Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19, 2026-11-26): tính năng phải thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác. Đồng thời (3) Floci phải hỗ trợ toàn phần hoặc một phần. CRUD của resource chính luôn làm. Chỉ chọn tính năng thường dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm                  | Tính năng                                                                                                            | Tiêu chí | Floci 2.4.0                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Log groups            | Danh sách (tên, retention, dung lượng, ngày tạo), lọc theo prefix, **tạo** (tên + retention), **sửa retention**, xóa | CRUD     | Toàn phần; nhận cả retention sai luật (7 #2) → form chỉ cho chọn giá trị AWS |
| Log group › Search    | Tìm trong mọi stream: filter pattern, khoảng thời gian, tự làm mới                                                   | (1)      | Toàn phần: đủ 4 kiểu pattern (7 #3)                                          |
| Log group › Streams   | Danh sách stream (mới nhất trên) › xem từng stream, Load older                                                       | (1)      | Toàn phần                                                                    |
| Subscription filter   | Xem, tạo (pattern → **Lambda hoặc Kinesis**), xóa                                                                    | (2)      | Toàn phần: Lambda và Kinesis nhận log thật (7 #6, #8)                        |
| Send test event       | Ghi một dòng log vào group để thử subscription filter / filter pattern mà không phải chạy service nguồn              | (2)      | Toàn phần. User chốt 2026-11-26                                              |
| Dùng chung            | Tách phần đọc log ra `shared/logs/`; Lambda › Monitor, task ECS › Logs và trang Logs cùng dùng                       | —        | —                                                                            |
| Link vào trang Logs   | Lambda, task ECS, RDS, DocumentDB, ElastiCache, Amazon MQ, CloudFormation (3.8)                                      | (2)      | Toàn phần: các service này tự ghi log (7 #7)                                 |
| Link ra trang nguồn   | Chi tiết group có tên theo mẫu của service (3.2) → link sang trang của resource; chỉ tách tên, không gọi thêm API    | (2)      | —                                                                            |
| Kinesis › Data viewer | Record gzip của subscription filter hiện JSON đã giải nén thay cho "Binary (N bytes)" (3.9)                          | (2)      | Toàn phần (7 #8). Đề xuất của Claude                                         |
| Dọn test              | `tests/it/leftovers.mjs` xóa log group của resource test                                                             | —        | Hiện còn khoảng 550 group do test để lại (7 #10)                             |

### Để sau

| Tính năng                        | Ghi chú                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Logs Insights                    | Floci chỉ chạy `fields/filter/sort/dedup/limit`; `stats`, `parse` lỗi (7 #4). User chốt 2026-11-26          |
| Metrics, Alarm, metric filter    | Floci chỉ tự sinh metric SQS (7 #9); metric filter cần trang Metrics mới thấy kết quả. User chốt 2026-11-26 |
| Tag                              | Đoán ít dùng                                                                                                |
| Tạo stream tay, xóa stream       | Đoán ít dùng: stream do service tạo; "Send test event" tự tạo stream khi cần                                |
| Subscription filter tới Firehose | Chưa có trang Firehose                                                                                      |

### Không làm

| Tính năng                           | Lý do                                                   |
| ----------------------------------- | ------------------------------------------------------- |
| Live Tail                           | Floci 2.4.0 `UnsupportedOperation`; tự làm mới thay thế |
| Export task                         | Floci 2.4.0 `UnsupportedOperation`                      |
| EventBridge rule → log group        | Floci 2.4.0 nhận target nhưng không giao event (7 #11)  |
| Log của Step Functions, API Gateway | Floci 2.4.0 không ghi dù đã cấu hình (7 #7)             |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm.

- Tên log group có `/`, nên đưa vào query string (`?group=`), giống `?key=` của S3.
- Tab của trang chi tiết lưu trên URL (`?tab=`, `useTabParam`).
- Hàm route **không** nhận tham số tab khi chưa có chỗ nào truyền vào (bài học từ ponytail-audit 2026-11-26).

Sidebar: **Log groups**.

### 3.1 Danh sách log group — `/logs/groups`

```text
Log groups (5)                                          [↻] [Delete] [Create log group]
[🔍 Filter by prefix, e.g. /aws/lambda/   ]
 ☐ Log group ▲                              Retention     Stored bytes   Created
 ☐ /aws/lambda/process-order                Never expire        12.4 KB   2026-11-19 09:12
 ☐ /aws/rds/instance/app-db/error           Never expire         3.1 KB   2026-11-19 08:40
 ☐ /my-app/api                              7 days             220.0 KB   2026-11-19 08:01
```

- Danh sách: `DescribeLogGroups` (`logGroupNamePrefix` lấy từ ô tìm, vòng `nextToken`). Ô tìm lọc ở server theo prefix vì Floci bỏ qua `logGroupNamePattern`.
- Delete (chọn nhiều): `BulkActionModal` → `DeleteLogGroup` từng group, lỗi báo theo từng group.
- **Create log group** (modal, giống Create bus của EventBridge; đề xuất của Claude):
  - Name: luật AWS, 1–512 ký tự `A-Z a-z 0-9 . - _ / #`. Floci nhận cả tên sai nên form tự kiểm.
  - Retention: `Select`, gồm "Never expire" và các giá trị AWS cho phép (`RETENTION_DAYS`: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653).
  - Gọi `CreateLogGroup`, rồi `PutRetentionPolicy` nếu không chọn "Never expire". Xong mở trang chi tiết.
- Khung hẹp: tầng 1 là tên, tầng 2 là retention + dung lượng.

### 3.2 Chi tiết log group — `/logs/groups/detail?group=`

```text
/aws/lambda/process-order                    [↻] [Delete] [Edit retention] [Send test event]
Retention: Never expire · 12.4 KB · Created 2026-11-19 09:12 · Function: process-order ↗ · Stack: OrderStack ↗
[Search] [Log streams] [Subscription filters]
```

- **Mặc định mở tab Search** (giống "Search all log streams" của AWS, việc hay làm nhất).
- **Link ra trang nguồn**: tách theo tên group, không gọi thêm API, resource không còn thì trang đích tự báo not found.

  | Tên group                         | Link                                          |
  | --------------------------------- | --------------------------------------------- |
  | `/aws/lambda/<fn>`                | "Function: `<fn>`" → trang function           |
  | `/aws/rds/instance/<id>/…`        | "Database: `<id>`" → trang database RDS       |
  | `/aws/docdb/cluster/<id>/…`       | "Cluster: `<id>`" → trang cluster DocumentDB  |
  | `/aws/elasticache/cluster/<id>/…` | "Cluster: `<id>`" → trang cluster ElastiCache |
  | `/aws/amazonmq/broker/<id>/…`     | "Broker: `<id>`" → trang broker Amazon MQ     |

  Group tự đặt (task ECS, `LoggingConfig` riêng của Lambda, app) không có link.

- `StackLink` type `AWS::Logs::LogGroup`, physical ID là tên group.
- **Delete**: dùng `BulkActionModal` với một group, xong về danh sách.
- **Edit retention**: modal, cùng `Select` như form tạo → `PutRetentionPolicy`, hoặc `DeleteRetentionPolicy` khi chọn "Never expire".
- **Send test event** (modal):
  - Log stream: mặc định `console-test`, theo luật AWS (1–512 ký tự, không `:` và `*`).
  - Message: textarea, bắt buộc.
  - Gọi `DescribeLogStreams` để kiểm stream đã có chưa. Chưa có thì `CreateLogStream`; không gọi thẳng để tránh lỗi 400 `ResourceAlreadyExists` làm trình duyệt ghi `console.error`.
  - Rồi `PutLogEvents` với timestamp hiện tại. Xong làm mới tab Search.
  - Mô tả trong modal: "Matching subscription filters deliver this event too."

### 3.3 Tab Search (dùng chung với Lambda › Monitor)

```text
[🔍 Filter pattern, e.g. ERROR or { $.level = "ERROR" }   ]  [15m|1h|1d|7d]  [☐ Auto refresh] [↻]
Events (42)
 Timestamp              Message                                        Log stream
 2026-11-19 09:12:03    2026-11-19T09:12:03Z  abc  ERROR  boom …       2026/11/19/[$LATEST]1a2b
```

- Chính là phần đang có ở Lambda › Monitor, tách thành component `LogEvents` trong `shared/logs/` (3.7):
  - Ô filter pattern, gõ xong mới tải.
  - Khoảng thời gian `LOG_RANGES`.
  - Tự làm mới mỗi `LOG_REFRESH_INTERVAL_MS`.
  - Bảng Timestamp / Message / Log stream, mới nhất trên.
- Gọi `FilterLogEvents` (vòng `nextToken`). Group chưa có thì trả rỗng: kiểm bằng `DescribeLogGroups` trước để không bị 400.
- Mô tả cạnh ô filter, ví dụ ba kiểu pattern:
  - Chuỗi: `ERROR`, `?WARN ?ERROR`.
  - JSON: `{ $.level = "ERROR" }`.
  - Space-delimited: `[ip, method, status=5*]`.

  Pattern sai thì hiện lỗi gốc của Floci.

- Cột Log stream là link sang 3.5.
- **`LogEvents` giữ nguyên giao diện của Lambda › Monitor hiện tại** (header, nút Refresh, bảng). Hai nơi chỉ khác nhau qua props:
  - Tiêu đề / description.
  - Placeholder ô filter.
  - Nội dung empty state.
  - `streamHref?: (stream) => string`: trang Logs truyền vào để cột Log stream thành link; Lambda › Monitor không truyền nên vẫn là text.

  `shared/` không import route của `services/logs`.

### 3.4 Tab Log streams

```text
Log streams (3)
 Log stream ▲                          Last event
 2026/11/19/[$LATEST]1a2b3c4d          2026-11-19 09:12:03
 2026/11/19/[$LATEST]9f8e7d6c          2026-11-19 08:55:41
```

- `DescribeLogStreams` (`orderBy: LastEventTime`, `descending: true`, vòng `nextToken`). Bấm tên mở 3.5.

### 3.5 Xem một stream — `/logs/groups/stream?group=&stream=`

```text
/aws/lambda/process-order › 2026/11/19/[$LATEST]1a2b3c4d        [↻] [☐ Auto refresh]
 Timestamp              Message
 2026-11-19 09:12:01    START …
 2026-11-19 09:12:03    ERROR boom …
                                                        [Load older events]
```

- Gọi `GetLogEvents`, mặc định lấy cuối stream (giống AWS), hiện mới nhất trên. **Load older events** đi theo `nextBackwardToken`.
- Dùng lại bảng của `LogEvents`, bỏ cột Log stream.
- Group hoặc stream không có thì hiện "Log stream … not found": kiểm bằng `DescribeLogStreams` trước, như tab Logs của ECS đang làm.
- Đây cũng là đích của link từ task ECS (3.8).

### 3.6 Tab Subscription filters

```text
Subscription filters (1)                                [↻] [Delete] [Create]
 ◯ Name             Filter pattern     Destination
 ◯ errors-to-alert  ERROR              Lambda › alert-handler ↗
 ◯ all-to-stream                       Kinesis › app-logs ↗
```

- Danh sách: `DescribeSubscriptionFilters`. Cột Destination:
  - ARN Lambda → link sang trang function.
  - ARN Kinesis → link sang trang stream.
  - ARN khác (Firehose) → text.
- **Create** (modal):
  - Name, Filter pattern (rỗng là mọi event).
  - Destination type: `Lambda function` | `Kinesis stream`.
  - Destination: `Select` lấy từ `useFunctions` (Lambda) hoặc danh sách stream (Kinesis).
  - Gọi `PutSubscriptionFilter` với `destinationArn` là ARN đã chọn.
  - Không gọi `AddPermission` và không gửi `roleArn`, vì Floci không kiểm (giống quyết định ở EventBridge, Cognito).
- **Delete**: `BulkActionModal` → `DeleteSubscriptionFilter`.
- Mô tả theo loại đích:
  - Lambda: "Lambda receives matching events base64-encoded and gzipped in `event.awslogs.data`."
  - Kinesis: "Each record is gzipped JSON; the Kinesis Data viewer shows it decompressed."
- AWS giới hạn 2 filter mỗi group. Floci nhận cả filter thứ ba hay không chưa kiểm (7, mục chưa kiểm). Nếu bị từ chối thì hiện lỗi gốc.

### 3.7 Tách phần đọc log ra dùng chung

| Từ                                                                                                                           | Sang `web/src/shared/logs/`                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `logGroupExists`, `useFunctionLogs` (`lambda/hooks/useFunctionLogs.ts`)                                                      | `useLogEvents(logGroupName, options)` — query key theo log group, không theo function |
| Bảng, ô filter, khoảng thời gian, auto refresh (`lambda/components/MonitorTab.tsx`)                                          | Component `LogEvents` (nhận `logGroupName`)                                           |
| `LOG_RANGES`, `DEFAULT_LOG_RANGE`, `LOG_REFRESH_INTERVAL_MS` (`lambda/constants.ts`), `logMessageText` (`lambda/helpers.ts`) | `shared/logs/constants.ts`, `shared/logs/format.ts`                                   |
| Client CloudWatch Logs (đang tạo trong `useLambda` và `useTaskLogs`)                                                         | `useLogsClient` trong `shared/logs/` (shared không import từ `services/`)             |
| Bảng message (cột Timestamp / Message, `messageStyle`) của `ecs/components/TaskLogsTab.tsx`                                  | Dùng lại bảng của `LogEvents`                                                         |

- **Lambda › Monitor** chỉ còn `<LogEvents logGroupName={…} />` và nút **View in CloudWatch Logs**. Giao diện giữ nguyên.
- **Task ECS › Logs**:
  - Hiện đang import `logGroupExists`, `LOG_REFRESH_INTERVAL_MS`, `logMessageText` từ Lambda; chuyển sang import từ `shared/logs/`.
  - Giữ hành vi riêng: chọn container, đọc stream `<prefix>/<container>/<taskId>` từ đầu.
  - Thêm link **View in CloudWatch Logs** tới 3.5.
- Không viết thêm test cho Monitor và Logs của ECS trước khi tách. Các test hiện có phải pass không đổi:
  - `tests/e2e/sqs-flows.spec.ts` (Refresh, chờ log).
  - `tests/e2e/ecs.spec.ts` (log của task).
  - Ảnh chụp trong `tests/ux` và `tests/mobile`.

### 3.8 Link vào trang Logs từ service khác

Không gọi thêm API: group chưa có thì trang Logs hiện not found.

| Chỗ                               | Đổi                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Lambda › Monitor                  | Nút **View in CloudWatch Logs** → chi tiết group của function (`logGroupOf`, có tính `LoggingConfig`)          |
| Task ECS › Logs                   | Link **View in CloudWatch Logs** → 3.5 (group + stream của container đang chọn)                                |
| RDS › Logs                        | Tên group (hiện chỉ để copy) thành link sang chi tiết group; giữ nút copy                                      |
| DocumentDB › chi tiết cluster     | Thêm "Log group: `/aws/docdb/cluster/<id>/audit`" (link) ở phần Endpoints của tab Connectivity                 |
| ElastiCache › chi tiết cluster    | Thêm link "Log group: `/aws/elasticache/cluster/<id>/engine-log`" ở phần thông tin chung                       |
| Amazon MQ › chi tiết broker       | Thêm link "Log group: `/aws/amazonmq/broker/<id>/general`" ở phần thông tin chung                              |
| CloudFormation `resourceLinks.ts` | `AWS::Logs::LogGroup` → `/logs/groups/detail?group=<tên>` cho mọi group (thay cho link tab Monitor của Lambda) |

Tên group của mỗi service là hằng số đặt cạnh route của service đó, dùng chung cho link vào (3.8) và link ra (3.2).

### 3.9 Kinesis › Data viewer: record của CloudWatch Logs

- Hiện `recordData.ts` coi byte không phải UTF-8 là binary, nên record gzip từ subscription filter hiện "Binary (N bytes)".
- Cách sửa: Data viewer nhận ra gzip bằng 2 byte đầu `1f 8b`, giải nén bằng `DecompressionStream("gzip")` có sẵn của trình duyệt, rồi hiện như JSON.
- Không thêm dependency.
- Đề xuất của Claude.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác             | Gọi                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------- |
| Danh sách group      | `DescribeLogGroups` (`logGroupNamePrefix`)                                              |
| Tạo / sửa retention  | `CreateLogGroup` + `PutRetentionPolicy`; `PutRetentionPolicy` / `DeleteRetentionPolicy` |
| Search               | `DescribeLogGroups` (kiểm tồn tại) + `FilterLogEvents`                                  |
| Streams / một stream | `DescribeLogStreams` / `GetLogEvents`                                                   |
| Send test event      | `DescribeLogStreams` → (`CreateLogStream`) → `PutLogEvents`                             |
| Subscription filter  | `DescribeSubscriptionFilters`, `PutSubscriptionFilter`, `DeleteSubscriptionFilter`      |
| Xóa group            | `DeleteLogGroup`                                                                        |

---

## 5. Trạng thái và lỗi

| Tình huống                   | Hiển thị                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Log group / stream không có  | "Log group … not found" / "Log stream … not found" kèm link về danh sách / group |
| Filter pattern sai           | Lỗi gốc (`Invalid filter pattern at position …`)                                 |
| Group có deletion protection | Lỗi gốc khi xóa                                                                  |
| Tạo group trùng tên          | Lỗi gốc (`ResourceAlreadyExistsException`)                                       |
| Quá nhiều log                | Floci giữ tối đa 20.000 event (7 #7); log cũ bị đẩy ra                           |

---

## 6. Kỹ thuật

### Package

Không cần cài: `@aws-sdk/client-cloudwatch-logs` đã có trong `web` và `tests`. Giải nén gzip dùng `DecompressionStream` của trình duyệt.

### Cấu trúc thư mục

```bash
web/src/shared/logs/
├── constants.ts, format.ts       # LOG_RANGES, LOG_REFRESH_INTERVAL_MS, logMessageText (chuyển từ Lambda)
├── useLogsClient.ts              # CloudWatchLogsClient qua /aws
├── useLogEvents.ts               # logGroupExists + FilterLogEvents (chuyển từ useFunctionLogs)
└── LogEvents.tsx                 # ô filter, khoảng thời gian, auto refresh, bảng (chuyển từ MonitorTab)

web/src/services/logs/
├── index.tsx, routes.ts, constants.ts, schemas.ts, sources.ts   # sources: tên group ↔ trang nguồn (3.2)
├── hooks/                        # useLogGroups, useLogStreams, useStreamEvents, useSubscriptionFilters
├── pages/                        # LogGroupList, LogGroupDetail, LogStream
└── components/                   # CreateLogGroupModal, EditRetentionModal, SendTestEventModal,
                                  # StreamsTab, SubscriptionFiltersTab, CreateSubscriptionFilterModal
```

Một dòng trong `registry.ts` (nhóm "Management & governance"); icon theo cách các service khác đang làm.

### Dùng lại từ phần đã có

| Thành phần                                                                                | Dùng cho                      |
| ----------------------------------------------------------------------------------------- | ----------------------------- |
| Phần đọc log của Lambda (chuyển sang `shared/logs/`)                                      | Search, Lambda › Monitor, ECS |
| `ActionBar`, `refreshAction`, `BulkActionModal`, `FormModal`, `useZodForm`, `useTabParam` | Bảng, modal, tab              |
| `useFunctions`, `lambdaRoutes`; hook danh sách stream, `kinesisRoutes`                    | Chọn đích, link đích          |
| Route của RDS, DocumentDB, ElastiCache, Amazon MQ                                         | Link ra trang nguồn           |
| `StackLink` (CloudFormation)                                                              | Chi tiết log group            |
| `EmptyState`, `emptyOrError`, `pageState`, `useIsCompact`, `useNotify`, `formatDate`      | Trạng thái, thông báo         |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19 và 2026-11-26, region `ap-southeast-1`. Resource tạm đã xóa.

| #   | Rủi ro                                  | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Log group, stream**                   | **Ổn.** Create / delete; `DescribeLogGroups` có `creationTime`, `storedBytes`, `retentionInDays`, phân trang; `logGroupNamePrefix` đúng. `DescribeLogStreams` `orderBy=LastEventTime` đúng. 2026-11-26: `PutRetentionPolicy` / `DeleteRetentionPolicy`, `CreateLogStream`, `PutLogEvents`, `DeleteLogStream` chạy                                                                                                                                                                                                                                                    |
| 2   | **Lệch AWS**                            | `logGroupNamePattern` (DescribeLogGroups) và `logStreamNamePrefix` (FilterLogEvents) bị bỏ qua. Retention nhận giá trị tùy ý (2026-11-26: 8 ngày vẫn nhận). `PutLogEvents` không từ chối event cũ / sai thứ tự                                                                                                                                                                                                                                                                                                                                                       |
| 3   | **Filter pattern**                      | **Đủ 4 kiểu:** chuỗi (AND, `?` OR, `-` loại, cụm), JSON (`{ $.level = "ERROR" }`, `{ $.code >= 500 }`), space-delimited, regex `%…%`. Pattern sai → 400 rõ vị trí. Khoảng thời gian, `logStreamNames`, phân trang đúng                                                                                                                                                                                                                                                                                                                                               |
| 4   | **Logs Insights**                       | Chỉ `fields/filter/sort/dedup/limit` (2026-11-26: query đơn giản `Complete`); `stats`, `parse`, `like` → `Failed`; `@logStream` rỗng                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | **Live Tail, export, query definition** | `UnsupportedOperation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | **Subscription filter → Lambda**        | **Ổn.** Lambda nhận `event.awslogs.data` (base64 + gzip) chứa đúng event khớp filter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 7   | **Nguồn log**                           | Lambda ghi `/aws/lambda/<fn>` (không có dòng `START` / `END` / `REPORT`); `LoggingConfig` group riêng + JSON chạy. 2026-11-26 tự ghi: RDS `/aws/rds/instance/<id>/error`, DocumentDB `/aws/docdb/cluster/<id>/audit`, ElastiCache `/aws/elasticache/cluster/<id>/engine-log` (`<id>` là `ReplicationGroupId`, đúng ID của trang cluster, không có đuôi `-001`), Amazon MQ `/aws/amazonmq/broker/<id>/general`; task ECS theo `awslogs`. API Gateway, Step Functions **không** ghi. Tối đa 20.000 event / account (`FLOCI_SERVICES_CLOUDWATCHLOGS_MAX_STORED_EVENTS`) |
| 8   | **Subscription filter → Kinesis**       | **Ổn** (2026-11-26). Không cần `roleArn`. Mỗi lần giao là một record gzip JSON (`logEvents[]`) chỉ chứa event khớp pattern; hai filter trên cùng group đều chạy                                                                                                                                                                                                                                                                                                                                                                                                      |
| 9   | **Metrics**                             | 2026-11-26: `ListMetrics` chỉ có namespace `AWS/SQS` (11 metric, số liệu thật theo giờ); không có metric của Lambda, DynamoDB, ECS, Kinesis…; chưa có alarm. Lý do không làm Metrics                                                                                                                                                                                                                                                                                                                                                                                 |
| 10  | **Log group do test để lại**            | 2026-11-26: khoảng 550 group (`/aws/lambda` 297, `/aws/rds` 168, `/aws/amazonmq` 34, `/aws/elasticache` 32, `/aws/docdb` 23). `leftovers.mjs` chưa xóa log group                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | **EventBridge → log group**             | 2026-11-26: `PutTargets` với ARN log group được nhận, nhưng event khớp rule không vào group                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12  | **Filter thứ ba trên một group**        | 2026-11-26: Floci nhận (AWS giới hạn 2). IT `logs.test.ts` ghi lại; trang không chặn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Kết quả thử (2026-11-26, Floci 2.4.0, console bản Docker):** unit 581/581 (web) + 12/12 (server), IT 208/208 (`logs.test.ts` 8/8), E2E 254/254 (`logs.spec.ts` 13/13 sau khi sửa minor; link Logs trong `ecs`, `docdb`, `elasticache`, `mq`, `rds`), UI 264/264, UX 11/11, mobile 36/36. Xem tay 1440 / 1024 / 390px với tên group / stream và message dài: không cuộn ngang, không `console.error`. Chạy kết hợp: stack CloudFormation có `AWS::Logs::LogGroup` (tên có `#`) link hai chiều; Lambda có `LoggingConfig` group riêng; Lambda đã xóa thì link "Function:" mở trang not found của Lambda; Floci nhận subscription filter trỏ tới Lambda không tồn tại (chỉ tạo được qua SDK / IaC). Bug tìm được và đã sửa: (1) review: tab Log streams / Subscription filters gọi API cho group đã xóa (400) → kiểm group trước; trang stream quay spinner mãi khi Floci lỗi → hiện lỗi kèm Retry; thiếu ví dụ ba kiểu filter pattern → thêm cạnh ô filter. Sửa thêm: mở group khi chưa có rồi tạo thì không còn nháy "not found" từ cache; tạo group mà đặt retention lỗi thì vẫn mở group và báo "Couldn't set retention". (2) E2E: xóa group từ trang chi tiết làm trang kẹt ở "not found" và gửi một request 400 (tải lại query của group vừa xóa); nay query của group bị xóa chỉ đánh dấu cũ, không tải lại.

**Dọn test (`leftovers.mjs`):**

- Xóa log group có tên chứa tiền tố resource test (`lc-it-`, `lc-e2e-`).
- Group của Amazon MQ mang ID broker (`b-…`) nên không lọc theo tên được: bỏ qua.

---

## 8. Thứ tự làm

1. Tách phần đọc log ra `shared/logs/` (3.7); Lambda › Monitor và task ECS › Logs dùng lại; chạy lại test của Lambda và ECS.
2. Khai báo trong `registry.ts`, route, sidebar.
3. Danh sách log group: lọc theo prefix, tạo (retention), xóa.
4. Chi tiết:
   - Header (retention, link nguồn, `StackLink`), Edit retention, Send test event.
   - Tab Search (dùng `LogEvents`), tab Log streams, trang xem một stream.
5. Tab Subscription filters (tạo → Lambda / Kinesis, xóa).
6. Link vào trang Logs từ Lambda, ECS, RDS, DocumentDB, ElastiCache, Amazon MQ, CloudFormation (3.8).
7. Data viewer của Kinesis giải nén record gzip (3.9).
8. `leftovers.mjs` dọn log group.
9. Test:
   - Unit: luật tên / retention, tách tên group ra trang nguồn (`sources.ts`), nhận gzip của Kinesis.
   - Integration `tests/it/logs.test.ts`: filter pattern, retention, streams, send test event, subscription filter → Lambda nhận log và → Kinesis nhận record.
   - E2E: một luồng chính, các link qua lại.
   - Trang danh sách và chi tiết vào `tests/ui/responsive.spec.ts`.

**Kiểm tra:** chạy trên Floci thật, chụp ở 1440, 1024 và 390px, không trang nào cuộn ngang (tên group / stream và message dài).

Trọn luồng:

1. Invoke một Lambda có log `ERROR` → danh sách thấy `/aws/lambda/<fn>` → Search `ERROR` thấy dòng lỗi, đổi sang JSON pattern.
2. Log streams → mở stream mới nhất → Load older.
3. Tạo subscription filter `ERROR` → Lambda thứ hai → invoke lại → log của Lambda thứ hai có event đã giải nén.
4. Tạo subscription filter → stream Kinesis → Send test event → Data viewer của Kinesis hiện JSON đã giải nén.
5. Tạo group `/my-app/api` retention 7 ngày → sửa thành Never expire.
6. Lambda › Monitor vẫn như cũ, nút View in CloudWatch Logs mở đúng group.
7. Task ECS › Logs mở đúng stream; RDS / DocumentDB / ElastiCache / Amazon MQ mở đúng group, và link ngược về đúng trang.
8. Xóa subscription filter, xóa group.

---

## 9. Quyết định

| Quyết định                                                                 | Lý do                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Chọn tính năng theo 3 tiêu chí, làm đơn giản, giống AWS                    | User chốt 2026-11-17, bổ sung 2026-11-19, 2026-11-26                            |
| Chỉ làm Logs, không làm Metrics / Alarm                                    | Floci chỉ tự sinh metric SQS. User chốt 2026-11-26                              |
| Tạo log group, sửa retention                                               | CRUD luôn làm (user chốt 2026-11-26)                                            |
| Subscription filter tới Lambda và Kinesis                                  | Nối service, Floci chạy thật. Lambda: user chốt 2026-11-19; Kinesis: 2026-11-26 |
| Logs Insights để sau                                                       | Floci không chạy `stats` / `parse`. User chốt 2026-11-26                        |
| Có "Send test event"                                                       | Thử subscription filter không cần service nguồn. User chốt 2026-11-26           |
| Tách phần đọc log ra `shared/logs/`, Lambda và ECS dùng lại                | Một chỗ code; ECS đang import chéo từ Lambda. User chốt 2026-11-19 (Lambda)     |
| Link hai chiều theo tên group, không gọi thêm API                          | Nối service mà không thêm logic bù cho Floci                                    |
| Không gọi `AddPermission`, không gửi `roleArn` khi tạo subscription filter | Floci không kiểm; giống EventBridge, Cognito                                    |
| Tên log group trong query string (`?group=`)                               | Tên có `/`; giống `?key=` của S3. User duyệt 2026-11-19                         |
| Chi tiết log group mặc định mở tab Search                                  | Việc hay làm nhất. User duyệt 2026-11-19                                        |
| Create log group, Edit retention, Send test event dạng modal               | Form nhỏ, giống Create bus của EventBridge. Đề xuất của Claude                  |
| Data viewer của Kinesis giải nén gzip bằng `DecompressionStream`           | Log đẩy sang Kinesis phải đọc được; không thêm dependency. Đề xuất của Claude   |
| Không sửa server                                                           | CloudWatch Logs là AWS API thuần, đi qua proxy `/aws`                           |
