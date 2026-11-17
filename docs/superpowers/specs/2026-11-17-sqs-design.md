# SQS — Thiết kế

> Ngày: 2026-11-17 · Trạng thái: chờ duyệt · Thuộc: [Local Console](2026-11-09-localconsole-design.md)

## 1. Mục tiêu

Làm màn hình SQS giống AWS SQS Console. Dev local dùng để:

- Xem app đã đẩy message vào queue chưa, nội dung là gì, có bị dồn hay không.
- Gửi message thử để chạy consumer (app hoặc Lambda).
- Test trọn flow lỗi: consumer nhận quá số lần → message sang DLQ → sửa bug → redrive về queue gốc.
- Nối queue với service khác: Lambda trigger, đích event notification của S3.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`, giống S3 và DynamoDB. **Server không phải sửa gì.**

Tính năng đối chiếu với [tài liệu SQS của Floci](https://floci.io/floci/services/sqs/) (23 action, có FIFO và DLQ redrive) và đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17): chỉ làm tính năng (1) dev thường dùng khi code, chạy local, test, hoặc (2) cần để nối với service khác cho trọn flow. Tính năng dev local ít đụng hoặc làm ra ít giá trị thì không làm.

### Làm trong đợt này

| Nhóm     | Tính năng                                                                                                                                    | Lý do giữ                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Queue    | Liệt kê kèm số message (available, in flight); tạo **Standard hoặc FIFO** (content-based dedup); xóa nhiều queue                             | Xem app đẩy message chưa; tạo nhanh để thử   |
| Chi tiết | URL, ARN (copy được); thông số queue; DLQ đang gắn; các queue đang dùng queue này làm DLQ                                                    | Lấy URL/ARN cấu hình app; thấy queue nối đâu |
| Sửa      | Visibility timeout, delay, retention, max message size, receive wait time, content-based dedup (FIFO); **redrive policy** (DLQ, max receive) | Hạ visibility để thấy retry ngay; gắn DLQ    |
| Gửi      | Body; FIFO thì group ID (bắt buộc) và dedup ID                                                                                               | Chạy thử consumer                            |
| Peek     | Xem message **không lấy mất**: body (JSON thì format), attributes, số lần đã nhận, thời điểm gửi, group ID (FIFO)                            | Xem app gửi gì, xem bao nhiêu lần cũng được  |
| Poll     | Nhận message như một consumer (giống "Poll for messages" của AWS), chọn rồi xóa từng message                                                 | Giả lập consumer, test flow DLQ              |
| Purge    | Gõ tên queue để xác nhận (spec chính, mục 4)                                                                                                 | Dọn queue để test lại                        |
| Redrive  | Từ DLQ: chuyển hết message về queue gốc                                                                                                      | Sửa bug xong chạy lại message lỗi            |
| Lambda   | Danh sách Lambda đang đọc queue; **thêm trigger Lambda ngay từ trang queue**                                                                 | Nối SQS → Lambda (như DynamoDB stream)       |
| Theo dõi | Công tắc Auto refresh: tải lại số message mỗi 5 giây                                                                                         | Theo dõi consumer xử lý                      |
| Liên kết | Lambda Add trigger và S3 event notification: ô nhập SQS ARN đổi thành **dropdown chọn queue**                                                | Nối S3/Lambda ↔ SQS không phải chép ARN      |

### Làm sau

| Tính năng                                             | Ghi chú                                        |
| ----------------------------------------------------- | ---------------------------------------------- |
| Message attributes, delay khi gửi                     | Ít dùng khi gửi thử bằng tay                   |
| Gửi/xóa theo batch                                    | Gửi từng message là đủ cho test tay            |
| Đổi visibility của từng message                       | Sửa visibility timeout của queue là đủ         |
| Danh sách / hủy task redrive, redrive sang queue khác | Redrive về queue gốc chạy xong ngay (mục 7 #6) |
| Tag queue                                             | Ít dùng khi dev local                          |
| Chọn SNS topic làm nguồn (subscription)               | Làm cùng service SNS                           |

### Không làm

| Tính năng                                 | Lý do                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Access policy (`AddPermission`, `Policy`) | Floci chỉ áp dụng khi bật IAM enforcement; dev local không bật |
| SSE / KMS                                 | Không cần khi dev local                                        |
| Metrics CloudWatch, biểu đồ               | Cột số message và Auto refresh là đủ                           |
| Fair queue, high throughput FIFO          | Chuyện production                                              |

---

## 3. Màn hình

Theo đúng quy tắc chung của DynamoDB, ElastiCache, MQ: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; cột số căn phải (`Figure`); thiếu giá trị là "—"; khung hẹp thì bảng thành hai tầng (`useIsCompact`); khối rỗng hoặc lỗi vẫn giữ khung.

### 3.1 Danh sách queue — `/sqs/queues`

```text
Queues (3)                                             [↻] [Delete] [Create queue]
Region: ap-southeast-1.
[🔍 Find queues by name                     ]
 ☐ Name ▲              Type        Available   In flight   Created
 ☐ orders              Standard           12           1   2026-11-17 10:11:01
 ☐ orders-dlq          Standard            0           0   2026-11-17 10:11:01
 ☐ payments.fifo       FIFO                3           0   2026-11-17 10:12:40
```

- `ListQueues` (phân trang), rồi `GetQueueAttributes` cho từng queue (type, số message, ngày tạo).
- Bấm tên để mở chi tiết. Đường dẫn dùng **tên queue**; URL lấy bằng `GetQueueUrl`, không tự ghép host.
- Khung hẹp: tầng 1 là tên + Available, tầng 2 là type · in flight.

### 3.2 Tạo queue — `/sqs/queues/create`

| Trường              | Ghi chú                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Type                | `Tiles`: Standard / FIFO. Mặc định Standard                                   |
| Name                | 1–80 ký tự: chữ, số, `-`, `_`. FIFO phải kết thúc bằng `.fifo` (luật của SQS) |
| Content-based dedup | Chỉ hiện khi FIFO. Mặc định tắt                                               |

- `CreateQueue` với thông số mặc định của SQS. Muốn đổi thì sửa sau ở tab Settings (3.6).
- Tạo xong thì mở trang chi tiết.

### 3.3 Chi tiết queue — `/sqs/queues/:queue`

```text
orders                                  [Purge] [Delete] [Send message]
Standard · 12 available · 1 in flight · DLQ: orders-dlq
[Messages] [Lambda triggers] [Settings]
```

- Tab lưu trên URL (`?tab=`). **Mặc định mở Messages.**
- Queue là DLQ của queue khác: header có thêm nút **Start DLQ redrive** (3.7).
- Queue không tồn tại: "Queue … not found" kèm link về danh sách.

### 3.4 Tab Messages

```text
Messages                  Auto refresh [○]  [↻] [Poll for messages] [Peek messages]
12 available · 1 in flight · 0 delayed
```

**Peek** (mặc định khi mở tab, không làm thay đổi queue):

```text
 Message ID        Sent                  Received   Body
 69cf48f6…         2026-11-17 10:20:01          0   {"orderId": 42, …}
 20dc334d…         2026-11-17 10:20:03          1   {"orderId": 43, …}
```

- Bấm một dòng: split panel hiện body đầy đủ (JSON thì format), message attributes, system attributes (FIFO có group ID, dedup ID, sequence number). Giống panel giá trị của ElastiCache.
- Peek thấy cả message đang in flight (cột Received > 0). Ghi chú dưới header: "Peek doesn't change the queue. Use Poll to act as a consumer."

**Poll for messages** (modal, giả lập consumer):

- `ReceiveMessage`: tối đa 10 message, chờ tối đa 5 giây (long polling).
- Cảnh báo trong modal: "Polled messages are hidden for the visibility timeout (30 s) and their receive count goes up. After N receives they move to the DLQ." (N lấy từ redrive policy, không có DLQ thì bỏ câu sau).
- Danh sách message nhận được, chọn rồi **Delete** (`DeleteMessage`). Message không xóa sẽ quay lại queue sau visibility timeout.
- Không nhận được message nào: "No messages available. Messages in flight show up again after the visibility timeout."

**Auto refresh** (`Toggle`): bật thì tải lại số message và danh sách Peek mỗi 5 giây. Mặc định tắt.

### 3.5 Tab Lambda triggers

```text
Lambda triggers (1)                                           [↻] [Add trigger]
 Function            Batch size     State
 process-orders              10     Enabled
```

- `ListEventSourceMappings` lọc theo ARN của queue. Bấm tên function mở tab Triggers của function.
- **Add trigger (modal):** Function (dropdown), Batch size (1–10), Enabled. Cùng giới hạn và mặc định với modal của Lambda. Queue ARN lấy từ trang. Thêm xong thì tải lại và thông báo kèm link sang function.
- Bật/tắt, xóa trigger: làm ở tab Triggers của Lambda (đã có), tab này chỉ xem và thêm, giống DynamoDB.

### 3.6 Tab Settings

| Khối     | Nội dung                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Details  | Type, URL, ARN (copy được), ngày tạo, ngày sửa                                                                      |
| Connect  | URL dùng từ máy dev (`localhost:4566`, Floci trả về) và từ container trong compose (`floci:4566`), copy được        |
| Settings | Visibility timeout, delay, retention, max message size, receive wait time, content-based dedup (FIFO). Nút **Edit** |
| DLQ      | Redrive policy: DLQ (link), max receive count. Nút **Edit**                                                         |
| DLQ of   | Các queue đang dùng queue này làm DLQ (`ListDeadLetterSourceQueues`). Rỗng thì ẩn khối                              |

**Edit settings (modal):**

| Trường              | Giới hạn (luật của SQS) |
| ------------------- | ----------------------- |
| Visibility timeout  | 0 giây – 12 giờ         |
| Delivery delay      | 0 – 900 giây            |
| Retention           | 60 giây – 14 ngày       |
| Max message size    | 1 – 1024 KiB            |
| Receive wait time   | 0 – 20 giây             |
| Content-based dedup | Chỉ queue FIFO          |

**Edit DLQ (modal):** công tắc bật/tắt; DLQ (dropdown các queue **cùng loại**: FIFO chỉ chọn được queue FIFO, bỏ chính queue này); Max receive count (1–1000, mặc định 3). Tắt = xóa redrive policy.

### 3.7 Các modal xác nhận

| Thao tác          | Xác nhận                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Delete queue(s)   | Gõ `delete`. Liệt kê queue sẽ xóa. Queue có Lambda trigger hoặc là DLQ của queue khác thì cảnh báo |
| Purge             | Gõ tên queue (spec chính, mục 4)                                                                   |
| Start DLQ redrive | Báo số message sẽ chuyển và queue đích (queue gốc của từng message)                                |
| Delete message(s) | Trong modal Poll, không cần gõ: message chỉ xóa được khi vừa poll                                  |

### 3.8 Gửi message (modal)

| Trường           | Ghi chú                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| Body             | `ValueEditor` (dùng chung với Publish của MQ). Không rỗng, tối đa max message size |
| Message group ID | Chỉ FIFO, bắt buộc                                                                 |
| Deduplication ID | Chỉ FIFO. Bắt buộc khi queue tắt content-based dedup                               |

Gửi xong thì thông báo kèm Message ID. Modal giữ nội dung để gửi tiếp. FIFO gửi trùng trong 5 phút bị SQS bỏ qua: thông báo vẫn thành công (SQS không báo lỗi), mô tả dưới trường Dedup ID ghi rõ.

### 3.9 Thay đổi ở Lambda và S3

| Chỗ                                | Đổi                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Lambda › Add trigger › SQS         | Ô "Queue ARN" thành dropdown queue (tên, ARN làm description). Bỏ kiểm tra `SQS_ARN_PATTERN` |
| S3 › Event notification › đích SQS | Ô ARN thành dropdown queue, giống đích Lambda đang có                                        |
| Lambda › tab Triggers, nguồn SQS   | Tên queue thành link sang trang queue                                                        |
| S3 › Event notification, đích SQS  | Tên queue thành link sang trang queue                                                        |

Queue FIFO không làm đích S3 notification được (luật của AWS; Floci chưa kiểm, kiểm ở bước 7 của mục 8): dropdown của S3 khóa queue FIFO kèm description.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác       | Gọi                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Peek           | `GET /aws/_aws/sqs/messages?QueueUrl=…` (endpoint riêng của Floci, không có trên AWS). Kèm header `Authorization` ghi region (mục 7 #3) |
| Poll           | `ReceiveMessage` (`MaxNumberOfMessages: 10`, `WaitTimeSeconds: 5`, lấy hết system và message attributes)                                |
| Số message     | `GetQueueAttributes`: `ApproximateNumberOfMessages`, `…NotVisible`, `…Delayed`                                                          |
| Redrive        | `StartMessageMoveTask` với `SourceArn` là ARN của DLQ, không truyền đích → về queue gốc của từng message                                |
| Sửa thông số   | `SetQueueAttributes`. Redrive policy gửi JSON `{ deadLetterTargetArn, maxReceiveCount }`; tắt DLQ gửi chuỗi rỗng                        |
| Lambda trigger | Dùng lại hàm tạo event source mapping của Lambda (`useTriggers.ts`) với ARN của queue                                                   |

---

## 5. Trạng thái và lỗi

| Tình huống                               | Hiển thị                                                  |
| ---------------------------------------- | --------------------------------------------------------- |
| Queue không có (`QueueDoesNotExist`)     | Trang chi tiết: "Queue … not found" kèm link về danh sách |
| Tên đã có (khác thông số)                | Lỗi trong form, nội dung gốc của SQS                      |
| Tạo lại queue vừa xóa                    | AWS bắt chờ 60 giây; Floci chưa kiểm. Hiện lỗi gốc nếu có |
| FIFO thiếu group ID (`MissingParameter`) | Chặn ở form trước khi gửi                                 |
| Purge hai lần trong 60 giây              | Lỗi `PurgeQueueInProgress` nếu Floci trả, hiện nguyên văn |
| Peek lỗi (Floci đổi API)                 | Khung bảng hiện lỗi; Poll vẫn dùng được                   |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-sqs -w web
```

`tests/` đã có `@aws-sdk/client-sqs`. Server không cần.

### Cấu trúc thư mục

```bash
web/src/services/sqs/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── peek.ts                    # gọi endpoint peek của Floci kèm header region
├── hooks/
│   ├── useSQS.ts              # SQSClient qua /aws
│   ├── useQueues.ts           # list, create, delete, attributes, set attributes
│   ├── useMessages.ts         # peek, poll, send, delete, purge, redrive
│   └── useQueueTriggers.ts    # event source mapping theo ARN của queue
├── pages/                     # QueueList, CreateQueue, QueueDetail
└── components/                # MessagesTab, TriggersTab, SettingsTab, các modal
```

- **SQSClient** cần `endpoint` là `proxyEndpoint()`: có `endpoint` riêng thì SDK **không** lấy host từ QueueUrl (`useQueueUrlAsEndpoint` chỉ chạy khi không có endpoint), nên request vẫn đi qua `/aws`.
- Khai báo trong `registry.ts`; icon `web/public/icons/sqs.svg` theo cùng khung với các icon cũ.

### Dùng lại từ phần đã có

| Thành phần                                                       | Dùng cho                                  |
| ---------------------------------------------------------------- | ----------------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `ModalFooter`      | Header bảng, modal xác nhận               |
| `FormModal`, `FormFields`, `useZodForm`                          | Tạo queue, sửa thông số, DLQ, gửi message |
| `ValueEditor`, `CodeEditor`                                      | Body khi gửi, xem body                    |
| `useSplitPanel`                                                  | Panel chi tiết message                    |
| `CopyButton`, `Figure`, `EmptyState`, `emptyOrError`, `NotFound` | URL/ARN, cột số, trạng thái bảng          |
| `useIsCompact`, `useNotify`, `formatDate`                        | Khung hẹp, thông báo, ngày                |
| `createStreamTrigger` / form trigger của Lambda                  | Add trigger từ trang queue                |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 qua proxy `/aws` của console ngày 2026-11-17, region `ap-southeast-1`, bằng `@aws-sdk/client-sqs` (giống SDK trong trình duyệt). Queue và bucket tạm đã xóa.

| #   | Rủi ro                                | Kết quả                                                                                                                                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **SQS API qua proxy** (JSON protocol) | **Ổn.** Create, List, Get/SetQueueAttributes, Send, Receive, Delete, Purge, DeleteQueue                                                                                              |
| 2   | **QueueUrl trỏ `localhost:4566`**     | Floci trả `http://localhost:4566/000000000000/<tên>`. SDK có `endpoint` riêng nên vẫn gọi qua `/aws`, không gọi thẳng `4566`                                                         |
| 3   | **Peek qua proxy**                    | Không kèm `Authorization` thì Floci tìm queue ở region mặc định → `QueueDoesNotExist`. Kèm header ghi region (`Credential=test/<ngày>/ap-southeast-1/sqs/…`, chữ ký bất kỳ) → **ổn** |
| 4   | **Peek không đổi queue**              | **Ổn.** Peek 3 lần: số message không đổi, `ApproximateReceiveCount` vẫn 0. Peek thấy cả message in flight (kèm số lần đã nhận)                                                       |
| 5   | **Poll → DLQ**                        | **Ổn.** `maxReceiveCount: 2`, visibility 1 giây: poll 2 lần nhận được, lần 3 rỗng, DLQ có 1 message. `ListDeadLetterSourceQueues` trả đúng queue nguồn                               |
| 6   | **Redrive**                           | **Ổn.** `StartMessageMoveTask` từ DLQ: task `COMPLETED` sau ~2 giây, message về lại queue gốc                                                                                        |
| 7   | **FIFO**                              | **Ổn.** Thiếu group ID → `MissingParameter`. Content-based dedup: gửi trùng 2 lần, queue chỉ có 1 message. Peek có group ID, dedup ID, sequence number                               |
| 8   | **S3 notification → SQS**             | **Ổn.** Queue nhận `s3:TestEvent` khi lưu cấu hình và event khi upload                                                                                                               |
| 9   | **Lambda trigger theo queue**         | `ListEventSourceMappings` lọc theo ARN queue chạy. SQS → Lambda đã có integration test (`tests/it/service-flow.test.ts`)                                                             |
| 10  | **`localOnly` của console**           | Request của SDK và peek từ trình duyệt là `same-origin` → qua                                                                                                                        |

---

## 8. Thứ tự làm

1. User cài package (mục 6). Icon, khai báo trong `registry.ts`, `useSQS`.
2. Danh sách queue, tạo (Standard/FIFO), xóa.
3. Trang chi tiết: tab Settings (xem, sửa thông số, DLQ).
4. Tab Messages: Peek + panel, gửi message, Purge, Auto refresh.
5. Poll, xóa message; Start DLQ redrive.
6. Tab Lambda triggers + Add trigger.
7. Dropdown queue ở Lambda Add trigger và S3 notification; link tên queue (3.9).
8. Test: unit cho logic thuần (`peek.ts`, schemas), integration (`tests/it/sqs.test.ts`), E2E một luồng chính.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: tạo queue + DLQ → gắn DLQ (max receive 2) → gửi message → peek (không đổi) → poll 2 lần không xóa → message sang DLQ → redrive → poll và xóa → purge → xóa queue. Thêm: tạo FIFO, gửi thiếu group ID bị chặn; thêm Lambda trigger từ trang queue, gửi message, thấy log ở tab Monitor của function.

---

## 9. Quyết định

| Quyết định                                             | Lý do                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Chọn tính năng theo 2 tiêu chí (dev dùng, nối flow)    | User chốt 2026-11-17                                                                |
| Có cả Peek (endpoint Floci) và Poll (`ReceiveMessage`) | Peek để xem, không làm message sang DLQ ngoài ý muốn; Poll để test đúng hành vi AWS |
| Peek kèm header `Authorization` tự ghép, không ký      | Floci chỉ đọc region từ header, không kiểm chữ ký (spec chính, mục 10 #1)           |
| Sửa redrive policy chung với sửa thông số              | Không có thì flow DLQ phải cấu hình bằng IaC                                        |
| Tạo queue chỉ hỏi type, tên, dedup                     | Thông số còn lại sửa ở tab Settings; form tạo ngắn                                  |
| Đường dẫn theo tên queue, URL lấy bằng `GetQueueUrl`   | Giống AWS Console; không tự ghép host                                               |
| Tab Lambda triggers chỉ xem và thêm                    | Bật/tắt, xóa đã có ở Lambda; giống DynamoDB                                         |
| Không sửa server                                       | SQS là AWS API thuần, đi qua proxy `/aws`                                           |
