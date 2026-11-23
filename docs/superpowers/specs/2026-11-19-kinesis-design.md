# Kinesis Data Streams — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã duyệt (2026-11-19) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4 (đưa lên từ "Để sau")

## 1. Mục tiêu

Màn hình Kinesis Data Streams cho stream mà app hoặc CDK tạo trên Floci. Dev local dùng để:

- Xem stream, shard, cấu hình.
- **Xem record** app đã đẩy vào stream (giống Data viewer của AWS).
- Nối stream với Lambda: thêm / xem / bật tắt / xóa trigger Kinesis trong Lambda › Triggers (Floci chạy thật).

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.** Đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng, **hoặc** (2) nối với service khác, **và** (3) Floci hỗ trợ. Chỉ tính năng hay dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm               | Tính năng                                                                                                               | Tiêu chí        | Floci 2.4.0               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------- |
| Data streams       | Danh sách (tên, status, capacity mode, số shard mở), tìm theo tên, xóa                                                  | (1)             | Toàn phần                 |
| Create data stream | Tên, capacity mode (On-demand / Provisioned + số shard)                                                                 | (1)             | Toàn phần (`ACTIVE` ngay) |
| Chi tiết           | Tab **Data viewer** (xem record theo shard), **Configuration** (ARN, retention, encryption, shard), **Lambda triggers** | (1), (2)        | Toàn phần                 |
| Lambda › Triggers  | **Add trigger Kinesis** (stream, batch size, starting position); hiện, bật / tắt, xóa                                   | (2) (user chốt) | Toàn phần (7 #4)          |
| StackLink          | "Stack: X" trên trang chi tiết                                                                                          | (2)             | Toàn phần                 |

### Để sau

| Tính năng                                                     | Ghi chú                                     |
| ------------------------------------------------------------- | ------------------------------------------- |
| Split / merge shard, đổi capacity mode, retention, encryption | Đoán ít dùng ở local                        |
| Enhanced fan-out consumer                                     | Đoán ít dùng; Floci chỉ trả snapshot (7 #3) |
| DynamoDB → Kinesis (streaming destination), Firehose          | Đoán ít dự án dùng                          |
| CloudWatch Logs subscription → Kinesis                        | Spec Logs chỉ làm đích Lambda               |
| Tag                                                           | Đoán ít dùng                                |

### Không làm

| Tính năng            | Lý do                                                        |
| -------------------- | ------------------------------------------------------------ |
| Put record (gửi thử) | AWS Console không có; dev gửi bằng app. User chốt 2026-11-19 |
| Pipes Kinesis → SQS  | Floci làm mất dữ liệu record (7 #6)                          |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: **Data streams**.

### 3.1 Data streams — `/kinesis/streams`

```text
Data streams (2)                                  [↻] [Delete] [Create data stream]
[🔍 Find data streams by name    ]
 ◯ Data stream name ▲     Status       Capacity mode    Open shards
 ◯ clicks                 ● Active     On-demand                  1
 ◯ orders-events          ● Active     Provisioned                2
```

- `ListStreams` (`StreamSummaries`, vòng `NextToken`) + `DescribeStreamSummary` từng stream (số shard mở). Local ít stream nên gọi song song.
- Delete: `ConfirmModal` gõ `delete` → `DeleteStream` (`EnforceConsumerDeletion: true`).

### 3.2 Create data stream — `/kinesis/streams/create`

| Trường        | Ghi chú                                                          |
| ------------- | ---------------------------------------------------------------- |
| Name          | 1–128 ký tự: chữ, số, `_`, `.`, `-`                              |
| Capacity mode | `Tiles`: On-demand / Provisioned. Mặc định On-demand (giống AWS) |
| Shards        | Chỉ khi Provisioned. Số nguyên ≥ 1, mặc định 1                   |

`CreateStream` (`StreamModeDetails`, `ShardCount`). Tạo xong mở chi tiết.

### 3.3 Chi tiết — `/kinesis/streams/:name`

```text
clicks                                                             [Delete]
● Active · On-demand · 1 open shard                    Stack: AppStack ↗
[Data viewer] [Configuration] [Lambda triggers]
```

- `DescribeStreamSummary`. Tab lưu trên URL (`?tab=`), **mặc định Data viewer**.
- `StackLink` type `AWS::Kinesis::Stream`, physical ID = tên stream.
- Stream không tồn tại: "Data stream … not found" kèm link về danh sách.

### 3.4 Tab Data viewer (giống AWS)

```text
Shard [shardId-000000000000 ▾]   Starting position [Trim horizon ▾]  [Get records]
Records (4)                                                       [Next records]
 Arrival time          Partition key    Sequence number    Data
 2026-11-19 10:20:01   user-1           1795078019344      {"event":"click","page":"/"}
 2026-11-19 10:20:03   user-2           1795078019345      {"event":"click","page":"/cart"}
```

- Shard: `ListShards`. Starting position: Trim horizon / Latest / At timestamp (thêm ô ngày giờ) — 3 kiểu AWS Data viewer hay dùng.
- **Get records:** `GetShardIterator` → `GetRecords` (`Limit` = `RECORDS_PAGE_SIZE`). **Next records:** `GetRecords` với `NextShardIterator`.
- Data: giải mã base64 → text UTF-8; JSON thì format gọn một dòng, bấm dòng mở rộng xem đủ (`CodeSnippet`). Không phải text (binary) → "Binary (N bytes)".
- Sequence number: hiện nguyên văn, không giả định độ dài (Floci ngắn hơn AWS, 7 #2).
- Rỗng: "No records from this position. Try Trim horizon to read from the start."

### 3.5 Tab Configuration

ARN (copy), status, capacity mode, retention (giờ), encryption (`EncryptionType`, `KeyId`), max record size; bảng shard: Shard ID, parent shard, trạng thái (Open / Closed theo `EndingSequenceNumber`). Chỉ xem.

### 3.6 Tab Lambda triggers

```text
Lambda triggers (1)                                         [↻] [Add trigger]
 Function            Batch size   Starting position   State
 process-clicks ↗    100          Trim horizon        ● Enabled
```

- `ListEventSourceMappings` (`EventSourceArn` = ARN stream). Function link sang tab Triggers của Lambda (giống tab Lambda triggers của SQS).
- **Add trigger** mở form Add trigger của Lambda đã chọn sẵn nguồn Kinesis và stream (dùng lại 3.7). User duyệt 2026-11-19.

### 3.7 Thay đổi ở Lambda › Triggers

| Chỗ                   | Đổi                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRIGGER_SOURCES`     | Chuyển `kinesis: "Kinesis"` từ `DISPLAY_ONLY_SOURCES` sang `TRIGGER_SOURCES` → có trong dropdown Add trigger                                                                                    |
| Add trigger › Kinesis | Stream (`Select` từ `ListStreams`), Batch size (1–10000, mặc định 100), Starting position (Latest / Trim horizon, mặc định Latest) → `CreateEventSourceMapping` (`EventSourceArn` = ARN stream) |
| Bảng Triggers         | Resource stream có link sang `/kinesis/streams/:name` (thêm vào `RESOURCE_HREFS`); bật / tắt, xóa như SQS, DynamoDB                                                                             |

Dùng lại hằng `STREAM_BATCH_SIZE`, `STARTING_POSITIONS` đang dùng cho DynamoDB Stream.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác        | Gọi                                              |
| --------------- | ------------------------------------------------ |
| Danh sách       | `ListStreams` + `DescribeStreamSummary`          |
| Tạo / xóa       | `CreateStream` / `DeleteStream`                  |
| Configuration   | `DescribeStreamSummary` + `ListShards`           |
| Data viewer     | `ListShards` + `GetShardIterator` + `GetRecords` |
| Lambda triggers | `ListEventSourceMappings` (`EventSourceArn`)     |
| Add trigger     | Lambda `CreateEventSourceMapping`                |

---

## 5. Trạng thái và lỗi

| Tình huống             | Hiển thị                                        |
| ---------------------- | ----------------------------------------------- |
| Stream không có        | "Data stream … not found" kèm link về danh sách |
| Trùng tên khi tạo      | Lỗi gốc `ResourceInUseException`                |
| Data viewer từ Latest  | Rỗng nếu chưa có record mới; gợi ý Trim horizon |
| Shard iterator hết hạn | Lỗi gốc; bấm Get records lại                    |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-kinesis -w web --min-release-age=7
```

### Cấu trúc thư mục

```bash
web/src/services/kinesis/
├── index.tsx, routes.ts, constants.ts      # RECORDS_PAGE_SIZE
├── recordData.ts              # base64 → text / JSON / binary
├── hooks/                     # useKinesis (client), useStreams (list, detail, create, delete, shards), useRecords
├── pages/                     # StreamList, CreateStream, StreamDetail
└── components/                # DataViewerTab, ConfigurationTab, LambdaTriggersTab
```

Một dòng trong `registry.ts`; icon `web/public/icons/kinesis.svg`. Thêm `AWS::Kinesis::Stream` → `/kinesis/streams/<name>` vào `resourceLinks.ts` của CloudFormation (service nào vào `main` sau thì làm).

### Dùng lại từ phần đã có

| Thành phần                                                                           | Dùng cho            |
| ------------------------------------------------------------------------------------ | ------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `useZodForm`, `CodeSnippet`            | Bảng, form, data    |
| Lambda `AddTriggerModal`, `useAddTrigger`, `STREAM_BATCH_SIZE`, `STARTING_POSITIONS` | Add trigger Kinesis |
| Mẫu tab Lambda triggers của SQS (`sqs/components/TriggersTab.tsx`)                   | Tab Lambda triggers |
| `StackLink` (CloudFormation)                                                         | Chi tiết stream     |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`. Resource tạm đã xóa.

| #   | Rủi ro                   | Kết quả                                                                                                                                                                 |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Stream, shard**        | **Ổn.** Create (on-demand, provisioned), Describe / Summary, List (`StreamSummaries`), ListShards, Delete, split / merge, retention, encryption                         |
| 2   | **Đọc record**           | **Ổn.** `GetShardIterator` đủ 5 kiểu, `GetRecords` có `Data` base64, `PartitionKey`, `ApproximateArrivalTimestamp`. `SequenceNumber` ngắn (13 chữ số; AWS 56)           |
| 3   | **Enhanced fan-out**     | `SubscribeToShard` chỉ trả một snapshot rồi đóng                                                                                                                        |
| 4   | **Lambda trigger**       | **Ổn.** ESM từ stream: batch size, Trim horizon / Latest, event đúng chuẩn AWS (data base64), bisect + retry chạy. `GetEventSourceMapping` thiếu `LastProcessingResult` |
| 5   | **CloudFormation**       | `AWS::Kinesis::Stream` và ESM tạo thật; `Ref` = tên stream                                                                                                              |
| 6   | **Pipes**                | Kinesis → SQS làm rỗng data, partition key, sequence number                                                                                                             |
| 7   | **Peek riêng của Floci** | `/_aws/kinesis/records` cần header `Authorization` có region, trả record mới nhất. Không dùng: Data viewer đi theo API chuẩn như AWS                                    |

**Chưa kiểm, kiểm khi làm:** SDK v3 qua proxy `/aws` (JSON 1.1 như DynamoDB); `ListEventSourceMappings` lọc theo `EventSourceArn` của Kinesis.

---

## 8. Thứ tự làm

1. User cài package (mục 6). Icon, khai báo trong `registry.ts`, `useKinesis`.
2. Hàm thuần + unit test: `recordData.ts` (text, JSON, binary, ký tự tiếng Việt).
3. Danh sách, tạo, xóa.
4. Chi tiết: Data viewer, Configuration, Lambda triggers.
5. Lambda › Triggers: Add trigger Kinesis, link stream.
6. `StackLink` và dòng trong `resourceLinks.ts` (khi CloudFormation đã vào `main`).
7. Test: integration `tests/it/kinesis.test.ts` (tạo stream, put record bằng SDK trong test, đọc lại, trigger Lambda nhận record); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; stream `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: Create data stream (on-demand) → app (hoặc test) đẩy record → Data viewer Trim horizon thấy record, JSON hiện đúng → Lambda › Add trigger Kinesis chọn stream → đẩy thêm record → log Lambda có event → tab Lambda triggers của stream thấy function → tắt / bật trigger → xóa stream.

---

## 9. Quyết định

| Quyết định                                                              | Lý do                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Đưa Kinesis lên từ "Để sau"                                             | Floci chạy tốt, trigger Lambda đã xác minh; user chọn làm 2026-11-19                  |
| Không có Put record                                                     | AWS Console không có. User chốt 2026-11-19                                            |
| Add trigger Kinesis từ Lambda                                           | Nối Lambda, Floci chạy thật. User chốt 2026-11-19                                     |
| Data viewer theo API chuẩn (`GetShardIterator` / `GetRecords`)          | Giống AWS; không cần header region như peek riêng của Floci                           |
| Chi tiết mặc định mở Data viewer                                        | Xem record là việc hay làm nhất. User duyệt 2026-11-19                                |
| Tab Lambda triggers trên trang stream, Add trigger dùng lại form Lambda | Thấy kết nối từ cả hai phía, giống tab Lambda triggers của SQS. User duyệt 2026-11-19 |
| Không sửa server                                                        | Kinesis là AWS API thuần, đi qua proxy `/aws`                                         |
