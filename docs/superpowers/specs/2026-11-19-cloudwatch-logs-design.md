# CloudWatch Logs — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã duyệt (2026-11-19) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4 (chuyển từ đợt 3 ngày 2026-11-23)

## 1. Mục tiêu

Làm màn hình CloudWatch Logs cho mọi log trên Floci, không chỉ log của Lambda. Dev local dùng để:

- Xem log của Lambda, RDS, DocumentDB, và log app tự ghi, ở một chỗ.
- Tìm log bằng filter pattern trong một khoảng thời gian, tự làm mới khi đang test.
- Nối log sang Lambda bằng **subscription filter** (Floci giao log thật cho Lambda).

Phần đọc log đang có ở tab Monitor của Lambda được **tách ra dùng chung** (user chốt 2026-11-19). Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác (tiêu chí quan trọng), **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Chỉ tính năng thường dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm                | Tính năng                                                                                | Tiêu chí               | Floci 2.4.0                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Log groups          | Danh sách (tên, retention, dung lượng, ngày tạo), tìm theo prefix, xóa                   | (1), (2)               | Toàn phần (`logGroupNamePattern` bị bỏ qua → dùng prefix, 7 #2) |
| Log group › Search  | Tìm trong mọi stream: filter pattern, khoảng thời gian, tự làm mới                       | (1)                    | Toàn phần: đủ 4 kiểu pattern (7 #3)                             |
| Log group › Streams | Danh sách stream (mới nhất trên) › xem từng stream                                       | (1)                    | Toàn phần                                                       |
| Subscription filter | Xem, tạo (pattern → Lambda), xóa                                                         | (2) Lambda (user chốt) | Toàn phần: Lambda nhận log thật (7 #6)                          |
| Liên kết            | Lambda › Monitor: nút **View in CloudWatch Logs**; `StackLink` cho log group             | (2)                    | Toàn phần                                                       |
| Dùng chung          | Tách phần đọc log của Lambda ra `shared/logs/`; Lambda › Monitor và trang Logs cùng dùng | —                      | —                                                               |

### Để sau

| Tính năng                                  | Ghi chú                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Retention, tag                             | Đoán ít dùng; Floci nhận cả retention không hợp lệ (7 #2)                |
| Metric filter                              | Chạy thật nhưng cần trang CloudWatch Metrics / Alarm mới thấy kết quả    |
| Logs Insights                              | Floci chỉ chạy `fields/filter/sort/dedup/limit` (7 #4), gần trùng Search |
| Subscription filter tới Kinesis / Firehose | Chưa kiểm; chưa có trang Kinesis                                         |
| Tạo log group, tạo stream, ghi log tay     | Đoán ít dùng: log do service / app ghi                                   |

### Không làm

| Tính năng   | Lý do                                                   |
| ----------- | ------------------------------------------------------- |
| Live Tail   | Floci 2.4.0 `UnsupportedOperation`; tự làm mới thay thế |
| Export task | Floci 2.4.0 `UnsupportedOperation`                      |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Tên log group có `/` → đưa vào query string (`?group=`), giống `?key=` của S3.

Sidebar: **Log groups**.

### 3.1 Danh sách log group — `/logs/groups`

```text
Log groups (5)                                                   [↻] [Delete]
[🔍 Filter by prefix, e.g. /aws/lambda/   ]
 ☐ Log group ▲                              Retention     Stored bytes   Created
 ☐ /aws/lambda/process-order                Never expire        12.4 KB   2026-11-19 09:12
 ☐ /aws/rds/instance/app-db/error           Never expire         3.1 KB   2026-11-19 08:40
 ☐ /my-app/api                              7 days             220.0 KB   2026-11-19 08:01
```

- `DescribeLogGroups` (`logGroupNamePrefix` từ ô tìm, vòng `nextToken`).
- Delete (chọn nhiều): `ConfirmModal` gõ `delete` → `DeleteLogGroup` từng group.
- Khung hẹp: tầng 1 tên, tầng 2 retention + dung lượng.

### 3.2 Chi tiết log group — `/logs/groups/detail?group=`

```text
/aws/lambda/process-order                                         [Delete]
Stack: OrderStack ↗ · Retention: Never expire · 12.4 KB
[Search] [Log streams] [Subscription filters]
```

- Tab lưu trên URL (`?tab=`). **Mặc định Search** (giống "Search all log streams" của AWS, việc hay làm nhất).
- Log group của Lambda (`/aws/lambda/<fn>`): thêm link "Function: <fn>" sang trang function.
- Log group của RDS (`/aws/rds/instance/<id>/error`): thêm link "Database: <id>" sang `/rds/databases/<id>` (chỉ tách tiền tố, không gọi thêm API). Service nào vào `main` sau thì làm.
- `StackLink` type `AWS::Logs::LogGroup`, physical ID = tên group.

### 3.3 Tab Search (dùng chung với Lambda › Monitor)

```text
[🔍 Filter pattern, e.g. ERROR or { $.level = "ERROR" }   ]  [15m|1h|1d|7d]  [☐ Auto refresh] [↻]
Events (42)
 Timestamp              Message                                        Log stream
 2026-11-19 09:12:03    2026-11-19T09:12:03Z  abc  ERROR  boom …       2026/11/19/[$LATEST]1a2b
```

- **Chính là phần đang có ở Lambda › Monitor**, tách thành component `LogEvents` trong `shared/logs/` (3.7): filter pattern (gõ xong mới tải), khoảng thời gian `LOG_RANGES`, tự làm mới mỗi `LOG_REFRESH_INTERVAL_MS`, bảng Timestamp / Message / Log stream, mới nhất trên.
- `FilterLogEvents` (vòng `nextToken`), group chưa có thì trả rỗng (kiểm bằng `DescribeLogGroups` trước, không để 400).
- Mô tả cạnh ô filter: ví dụ chuỗi (`ERROR`, `?WARN ?ERROR`), JSON (`{ $.level = "ERROR" }`), space-delimited (`[ip, method, status=5*]`). Pattern sai: lỗi gốc của Floci.
- Cột Log stream là link sang 3.5.
- **`LogEvents` giữ nguyên giao diện của Lambda › Monitor hiện tại** (header, nút Refresh, bảng). Khác nhau giữa hai nơi chỉ qua props: tiêu đề / description, placeholder ô filter, nội dung empty state, và `streamHref?: (stream) => string` (trang Logs truyền vào để cột Log stream thành link; Lambda › Monitor không truyền → text như cũ). `shared/` không import route của `services/logs`. Đề xuất của Claude.

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

- `GetLogEvents` (mặc định lấy cuối stream, giống AWS), hiện mới nhất trên; **Load older events** theo `nextBackwardToken`. Dùng lại bảng của `LogEvents` (bỏ cột Log stream).

### 3.6 Tab Subscription filters

```text
Subscription filters (1)                                [↻] [Delete] [Create]
 ◯ Name             Filter pattern     Destination
 ◯ errors-to-alert  ERROR              Lambda › alert-handler ↗
```

- `DescribeSubscriptionFilters`. Destination là ARN Lambda → link function; ARN khác (Kinesis, Firehose) → text.
- **Create** (modal): Name, Filter pattern (rỗng = mọi event), Lambda (`Select` từ `useFunctions` của Lambda) → `PutSubscriptionFilter` (`destinationArn` = ARN function). Không gọi `AddPermission` (Floci không kiểm, giống quyết định ở EventBridge, Cognito).
- **Delete**: `ConfirmModal` → `DeleteSubscriptionFilter`.
- Mô tả: "Lambda receives matching events base64-encoded and gzipped in `event.awslogs.data`."

### 3.7 Tách phần đọc log ra dùng chung

| Từ (Lambda)                                                                                                    | Sang `web/src/shared/logs/`                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `logGroupExists`, `useFunctionLogs` (`hooks/useFunctionLogs.ts`)                                               | `useLogEvents(logGroupName, options)` — query key theo log group, không theo function |
| Bảng, ô filter, khoảng thời gian, auto refresh (`components/MonitorTab.tsx`)                                   | Component `LogEvents` (nhận `logGroupName`)                                           |
| `LOG_RANGES`, `DEFAULT_LOG_RANGE`, `LOG_REFRESH_INTERVAL_MS` (`constants.ts`), `logMessageText` (`helpers.ts`) | `shared/logs/constants.ts`, `shared/logs/format.ts`                                   |
| Client `CloudWatchLogsClient` (đang tạo trong `useLambda`)                                                     | `useLogsClient` trong `shared/logs/` (shared không import từ `services/`)             |

- **Lambda › Monitor** chỉ còn: `<LogEvents logGroupName={…} />` + nút **View in CloudWatch Logs** (link `/logs/groups/detail?group=…`, giống AWS). Giao diện giữ nguyên.
- Lambda › Monitor hiện không có unit test riêng; được kiểm gián tiếp bởi `tests/e2e/sqs-flows.spec.ts` (bấm Refresh, chờ thấy log) và ảnh chụp `tests/ux`, `tests/mobile`. Tách xong: các test đó phải pass không đổi (ảnh chụp không đổi vì giao diện giữ nguyên); E2E mới của trang Logs (mục 8) phủ lọc pattern và đổi khoảng thời gian của `LogEvents`. Không viết thêm test cho Monitor trước khi tách. Đề xuất của Claude.

### 3.8 Liên kết từ service khác

| Chỗ                               | Đổi                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lambda › Monitor                  | Nút **View in CloudWatch Logs** (3.7)                                                                                                |
| CloudFormation `resourceLinks.ts` | `AWS::Logs::LogGroup` → `/logs/groups/detail?group=<tên>` (thay cho link tab Monitor của Lambda). Service nào vào `main` sau thì làm |
| RDS (khi có trang)                | Link log group `/aws/rds/instance/<id>/error`                                                                                        |

---

## 4. Cách hoạt động của một số thao tác

| Thao tác             | Gọi                                                                                |
| -------------------- | ---------------------------------------------------------------------------------- |
| Danh sách group      | `DescribeLogGroups` (`logGroupNamePrefix`)                                         |
| Search               | `DescribeLogGroups` (kiểm tồn tại) + `FilterLogEvents`                             |
| Streams / một stream | `DescribeLogStreams` / `GetLogEvents`                                              |
| Subscription filter  | `DescribeSubscriptionFilters`, `PutSubscriptionFilter`, `DeleteSubscriptionFilter` |
| Xóa group            | `DeleteLogGroup`                                                                   |

---

## 5. Trạng thái và lỗi

| Tình huống                   | Hiển thị                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| Log group không có           | "Log group … not found" kèm link về danh sách                 |
| Filter pattern sai           | Lỗi gốc (`Invalid filter pattern at position …`)              |
| Group có deletion protection | Lỗi gốc khi xóa (`ValidationException … deletion protection`) |
| Quá nhiều log                | Floci giữ tối đa 20.000 event (7 #7); log cũ bị đẩy ra        |

---

## 6. Kỹ thuật

### Package

Không cần cài: `@aws-sdk/client-cloudwatch-logs` đã có trong `web` và `tests`.

### Cấu trúc thư mục

```bash
web/src/shared/logs/
├── constants.ts, format.ts       # LOG_RANGES, LOG_REFRESH_INTERVAL_MS, logMessageText (chuyển từ Lambda)
├── useLogsClient.ts              # CloudWatchLogsClient qua /aws
├── useLogEvents.ts               # logGroupExists + FilterLogEvents (chuyển từ useFunctionLogs)
└── LogEvents.tsx                 # ô filter, khoảng thời gian, auto refresh, bảng (chuyển từ MonitorTab)

web/src/services/logs/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── hooks/                        # useLogGroups, useLogStreams, useStreamEvents, useSubscriptionFilters
├── pages/                        # LogGroupList, LogGroupDetail, LogStream
└── components/                   # StreamsTab, SubscriptionFiltersTab, CreateSubscriptionFilterModal
```

Một dòng trong `registry.ts`; icon `web/public/icons/logs.svg`.

### Dùng lại từ phần đã có

| Thành phần                                                                          | Dùng cho                   |
| ----------------------------------------------------------------------------------- | -------------------------- |
| Phần đọc log của Lambda (chuyển sang `shared/logs/`)                                | Search, Lambda › Monitor   |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `useZodForm`             | Bảng, modal                |
| `useFunctions`, `lambdaRoutes` (Lambda)                                             | Chọn Lambda, link function |
| `StackLink` (CloudFormation)                                                        | Chi tiết log group         |
| `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify`, `formatDate` | Trạng thái, thông báo      |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`. Resource tạm đã xóa, kiểm còn 0.

| #   | Rủi ro                                  | Kết quả                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Log group, stream**                   | **Ổn.** Create / delete, `DescribeLogGroups` có `creationTime`, `storedBytes`, `retentionInDays`, phân trang, `logGroupNamePrefix` đúng. `DescribeLogStreams` `orderBy=LastEventTime` đúng                                                                                                                                                |
| 2   | **Lệch AWS**                            | `logGroupNamePattern` (DescribeLogGroups) và `logStreamNamePrefix` (FilterLogEvents) bị bỏ qua. Retention nhận giá trị tùy ý. `PutLogEvents` không từ chối event cũ / sai thứ tự                                                                                                                                                          |
| 3   | **Filter pattern**                      | **Đủ 4 kiểu:** chuỗi (AND, `?` OR, `-` loại, cụm), JSON (`{ $.level = "ERROR" }`, `{ $.code >= 500 }`), space-delimited, regex `%…%`. Pattern sai → 400 rõ vị trí. Khoảng thời gian, `logStreamNames`, phân trang đúng                                                                                                                    |
| 4   | **Logs Insights**                       | Chỉ `fields/filter/sort/dedup/limit`; `stats`, `parse`, `like` → `Failed`; `@logStream` rỗng                                                                                                                                                                                                                                              |
| 5   | **Live Tail, export, query definition** | `UnsupportedOperation`                                                                                                                                                                                                                                                                                                                    |
| 6   | **Subscription filter → Lambda**        | **Ổn.** Lambda nhận `event.awslogs.data` (base64 + gzip) chứa đúng event khớp filter. Metric filter → metric và alarm cũng chạy (để sau)                                                                                                                                                                                                  |
| 7   | **Nguồn log**                           | Lambda ghi `/aws/lambda/<fn>` (không có dòng `START` / `END` / `REPORT`); `LoggingConfig` group riêng + JSON chạy. RDS tự ghi `/aws/rds/instance/<id>/error` (cả cluster). DocumentDB tự ghi. API Gateway, Step Functions **không** ghi dù đã cấu hình. Tối đa 20.000 event / account (`FLOCI_SERVICES_CLOUDWATCHLOGS_MAX_STORED_EVENTS`) |

**Chưa kiểm, kiểm khi làm:** subscription filter tới Kinesis / Firehose (để sau); ECS `awslogs` (agent ECS thấy log vào group, stream `prefix/container/taskId`).

---

## 8. Thứ tự làm

1. Tách phần đọc log của Lambda ra `shared/logs/` (3.7); Lambda › Monitor dùng lại; chạy lại test của Lambda.
2. Icon, khai báo trong `registry.ts`.
3. Danh sách log group, xóa.
4. Chi tiết: tab Search (dùng `LogEvents`), tab Log streams, trang xem một stream.
5. Tab Subscription filters (tạo → Lambda, xóa).
6. Nút View in CloudWatch Logs ở Lambda › Monitor; `StackLink` và dòng trong `resourceLinks.ts` (khi CloudFormation đã vào `main`).
7. Test: unit cho phần tách ra (nếu có logic mới); integration `tests/it/logs.test.ts` (filter pattern, streams, subscription filter → Lambda nhận log); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; group `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang (tên group / stream và message dài). Trọn luồng: invoke một Lambda có log `ERROR` → danh sách thấy `/aws/lambda/<fn>` → Search `ERROR` thấy dòng lỗi, đổi sang JSON pattern → Log streams mở stream mới nhất, Load older → tạo subscription filter `ERROR` → Lambda thứ hai → invoke lại → log của Lambda thứ hai có event giải nén → Lambda › Monitor vẫn như cũ, nút View in CloudWatch Logs mở đúng group → xóa subscription filter, xóa group.

---

## 9. Quyết định

| Quyết định                                                                | Lý do                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Chọn tính năng theo 3 tiêu chí, làm đơn giản, giống AWS                   | User chốt 2026-11-17, bổ sung 2026-11-19                |
| Làm subscription filter (chỉ đích Lambda)                                 | Nối Lambda, Floci chạy thật. User chốt 2026-11-19       |
| Tách phần đọc log của Lambda ra `shared/logs/`, Lambda › Monitor dùng lại | Một chỗ code cho cả hai trang. User chốt 2026-11-19     |
| Không gọi `AddPermission` khi tạo subscription filter                     | Floci không kiểm; giống EventBridge, Cognito            |
| Tên log group trong query string (`?group=`)                              | Tên có `/`; giống `?key=` của S3. User duyệt 2026-11-19 |
| Chi tiết log group mặc định mở tab Search                                 | Việc hay làm nhất. User duyệt 2026-11-19                |
| Không sửa server                                                          | CloudWatch Logs là AWS API thuần, đi qua proxy `/aws`   |
