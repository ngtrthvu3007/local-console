# Lambda — Thiết kế

> Ngày: 2026-11-09 · Trạng thái: đã làm (2026-11-09) · Thuộc: [Local Console](2026-11-09-localconsole-design.md)

## 1. Mục tiêu

Làm màn hình Lambda giống AWS Lambda Console, **chỉ gồm phần core mà dev local thật sự dùng**. Dev thường deploy function bằng tool của dự án (SAM, Serverless, Terraform, CDK…), nên console dùng để:

- Xem đang có function nào, cấu hình ra sao, chỉnh biến môi trường, sửa nhanh code rồi bấm Deploy.
- **Chỉ hỗ trợ Node.js và Python**: hai runtime sửa code được ngay trên trang. Function runtime khác (deploy bằng tool khác) vẫn hiện, test, cấu hình, gắn trigger được, chỉ không sửa code.
- Bấm **Test** với event giống thật (S3, SQS, API Gateway) và xem kết quả, log.
- Nối trigger **S3 → Lambda** và **SQS → Lambda**, rồi nhìn log chạy khi upload file hoặc gửi message.
- Tạo nhanh một function để thử một luồng.

Mọi thao tác đều gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Tất cả tính năng trong "Làm trong đợt này" đã được đối chiếu với [tài liệu Lambda của Floci](https://floci.io/floci/services/lambda/) **và chạy thử trên Floci 2.4.0** (xem mục 7). Floci chạy mỗi function trong một container Docker thật, dùng image chính thức của AWS Lambda.

---

## 2. Phạm vi

**Nguyên tắc chọn** (rút kinh nghiệm từ S3): chỉ đưa vào đợt này những việc dev local mở console ra để làm. Tính năng của production hoặc ít khi động tới thì để sau.

### Làm trong đợt này

| Nhóm     | Tính năng                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Function | Liệt kê, tạo (từ code Hello world Node.js/Python), xóa (có tùy chọn xóa luôn log group)                                                                   |
| Code     | Sửa code ngay trên trang (Node.js/Python, gói ≤ 3 MB), **bấm Deploy mới có hiệu lực** (không tự hot reload)                                               |
| Cấu hình | Description, memory, timeout, runtime, handler; biến môi trường                                                                                           |
| Test     | Invoke với JSON event, mẫu event (Hello world, S3 Put, SQS, API Gateway), gọi đồng bộ hoặc bất đồng bộ, lưu test event, xem response, thời gian chạy, log |
| Log      | Xem log CloudWatch của function, lọc theo chữ, chọn khoảng thời gian, **tự làm mới mỗi 5 giây**                                                           |
| Trigger  | S3 (event notification của bucket) và SQS (event source mapping): liệt kê, thêm, xóa, bật/tắt (SQS)                                                       |
| S3       | Modal tạo event notification của S3 có thêm gợi ý chọn Lambda function                                                                                    |

### Làm sau

| Tính năng                                           | Ghi chú                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Version, alias                                      | Floci chạy đúng (đã thử), nhưng là chuyện phát hành production                    |
| Tag                                                 | Ít dùng khi dev local                                                             |
| Function URL                                        | Floci chạy thật. Chỉ gọi được từ máy dev, app trong docker compose không gọi được |
| Snippet gọi function (`aws lambda invoke`, `curl`)  |                                                                                   |
| Hot reload từ thư mục trên máy                      | Cần mount thư mục code vào Floci trong compose. Chưa thử                          |
| Layer                                               | Floci chạy thật (đã thử)                                                          |
| Async config và destination (OnSuccess / OnFailure) | Floci chạy thật với SQS, SNS, Lambda, EventBridge                                 |
| Reserved concurrency, filter criteria, log JSON     | Dùng trong vài tình huống test hẹp                                                |
| Trigger Kinesis, DynamoDB Streams                   | Làm khi DynamoDB Streams có trên console                                          |
| Chọn SQS queue bằng dropdown                        | Đợt này nhập ARN. Có dropdown khi làm service SQS                                 |

### Không làm

| Tính năng                                       | Lý do                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SnapStart                                       | Floci chỉ lưu cấu hình, không chụp snapshot. Cold start local vốn chỉ ~0,1 s                                       |
| Provisioned concurrency                         | Floci chỉ lưu, local không có cold start đáng kể để tối ưu                                                         |
| Alias chia tải (weighted)                       | Chuyện canary của production                                                                                       |
| Resource-based policy (`AddPermission`)         | Floci không bắt buộc: S3 và SQS gọi được function mà không cần policy                                              |
| Code signing                                    | Floci lưu nhưng không kiểm tra chữ ký                                                                              |
| VPC, EFS, X-Ray tracing                         | Floci chỉ hỗ trợ một phần hoặc chỉ lưu. Không cần khi dev local                                                    |
| Response streaming (`InvokeWithResponseStream`) | Floci chưa có                                                                                                      |
| Durable functions                               | Tính năng mới, ít dùng, giao diện lớn                                                                              |
| Chọn architecture (arm64 / x86_64)              | Floci mặc định chạy theo CPU của máy, phải bật biến môi trường của Floci mới tôn trọng. Chỉ hiện để xem            |
| Test event dùng chung (shareable)               | Trên AWS lưu ở EventBridge Schema Registry. Lưu trên trình duyệt là đủ                                             |
| Upload .zip, tải .zip về                        | User chốt: dev deploy bằng tool của dự án (SAM, Terraform…), sửa nhanh thì đã có editor trên trang                 |
| Runtime khác Node.js/Python (Go, Java, .NET…)   | User chốt. Go phải biên dịch ra `bootstrap`, trình duyệt không build được; không có upload .zip thì không tạo được |
| Function dạng container image                   | Cần ECR hoặc image build sẵn trên máy                                                                              |

### Các đề xuất đã xem xét

Mỗi mục đã được tra tài liệu Floci, phần lớn đã chạy thử. Quyết định đã chốt với user.

| #   | Tính năng                      | Là gì                                                             | Floci                                                                       | Quyết định |
| --- | ------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| 1   | Invoke bất đồng bộ (`Event`)   | Gọi kiểu "gửi rồi thôi", đúng cách S3/SNS gọi function            | Chạy thật. Đã thử: trả 202, log có trong CloudWatch                         | đợt này    |
| 2   | Tự làm mới log                 | Tải lại log mỗi 5 giây ở tab Monitor                              | Log được ghi ngay khi function chạy xong (đã thử)                           | đợt này    |
| 3   | Function URL                   | URL HTTP riêng gọi thẳng function, không cần API Gateway          | Chạy thật. Đã thử GET/POST, event dạng HTTP API v2                          | làm sau    |
| 4   | Snippet gọi function           | Lệnh `aws lambda invoke` / `curl` mẫu kèm nút Copy                | Không phụ thuộc Floci                                                       | làm sau    |
| 5   | Hot reload từ thư mục trên máy | Function đọc code thẳng từ thư mục của máy dev, sửa là chạy luôn  | Phải bật `FLOCI_SERVICES_LAMBDA_HOT_RELOAD_ENABLED` trong compose. Chưa thử | làm sau    |
| 6   | Reserved concurrency           | Giới hạn số lần chạy đồng thời. Đặt 0 là chặn mọi lần gọi         | Chạy thật. Đã thử: đặt 0 thì invoke trả 429                                 | làm sau    |
| 7   | Filter criteria cho trigger    | Pattern JSON lọc message trước khi gọi function                   | Chạy thật (theo tài liệu). Message không khớp **bị xóa khỏi queue**         | làm sau    |
| 8   | Log dạng JSON và log level     | `LoggingConfig`: Text/JSON, mức log                               | Có (theo tài liệu)                                                          | làm sau    |
| 9   | Layer                          | Gói thư viện dùng chung, gắn vào nhiều function                   | Chạy thật. Đã thử: function import được module trong layer                  | làm sau    |
| 10  | Async config và destination    | Số lần retry, tuổi tối đa của event, đích khi thành công/thất bại | Chạy thật với SQS/SNS/Lambda/EventBridge (theo tài liệu)                    | làm sau    |
| 11  | Alias chia tải (weighted)      | Alias trỏ 2 version theo tỉ lệ                                    | Chạy thật. Đã thử: 50/50 thì 10 lần gọi ra đúng 5/5                         | không làm  |
| 12  | SnapStart                      | Chụp snapshot sau khi khởi động để giảm cold start                | **Chỉ lưu.** Bật lên không có gì chạy khác                                  | không làm  |
| 13  | Provisioned concurrency        | Giữ sẵn N container                                               | Chỉ lưu                                                                     | không làm  |

---

## 3. Màn hình

### 3.1 Danh sách function — `/lambda/functions`

```bash
Functions (3)                                   [↻] [Delete] [Create function]
[🔍 Find functions by name          ]
 ☐ Function name ▲     Runtime      Code size   Memory   Last modified
 ☐ process-upload      python3.12   229 B       128 MB   2026-11-09 11:21
 ☐ resize-image        nodejs22.x   1.2 MB      512 MB   2026-11-08 17:40
 ☐ send-mail           nodejs22.x   3.4 KB      128 MB   2026-11-01 09:03
```

- Chọn được nhiều function để xóa cùng lúc.
- Bấm vào tên thì mở trang chi tiết.
- Ô tìm lọc ngay trên trình duyệt. `ListFunctions` trả theo trang, console tải hết các trang (local thường ít function).
- **Chưa có function nào:** hiện "No functions" kèm nút Create function ngay trong bảng.

### 3.2 Tạo function — `/lambda/functions/create`

| Trường        | Ghi chú                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| Function name | 1–64 ký tự: chữ, số, `-`, `_`                                                                                   |
| Runtime       | Node.js và Python AWS còn hỗ trợ (`nodejs24.x`, `nodejs22.x`, `python3.11`–`python3.14`). Mặc định `nodejs22.x` |
| Memory        | 128–10240 MB, mặc định 128                                                                                      |
| Timeout       | 1–900 giây, mặc định 3                                                                                          |

- Function mới luôn bắt đầu bằng code **Hello world** của runtime, handler tự đặt: `index.handler` (Node.js), `lambda_function.lambda_handler` (Python). Không có ô Code source, ô Handler.
- Memory và Timeout nằm trong khối thu gọn "Additional settings".
- **Không có ô Role.** Floci bắt buộc gửi `Role` nhưng không kiểm tra role có tồn tại không, nên console dùng một role mặc định (hằng số). Role hiện ở tab Configuration để xem.
- Tạo xong thì chuyển sang tab Code của function và báo "Created function my-function".

### 3.3 Chi tiết function — `/lambda/functions/:name`

```bash
my-function                                          [Copy ARN] [Delete]
┌ Function overview ─────────────────────────────────────────────────────┐
│ ARN  arn:aws:lambda:ap-southeast-1:000000000000:function:my-function    │
│ Runtime  nodejs22.x    Handler  index.handler    Last modified  10:20    │
└────────────────────────────────────────────────────────────────────────┘
[Code] [Test] [Monitor] [Configuration] [Triggers]
```

- Tab lưu trên URL (`?tab=test`), giống trang bucket của S3. Mặc định mở tab Code.
- Function không tồn tại: trang báo "Function my-function not found" kèm link về danh sách.

### 3.4 Tab Code

```bash
Code source                                                          [Deploy]
File: [index.mjs ▾]                                 ⚠ Changes not deployed
┌──────────────────────────────────────────────────────────────────────┐
│ export const handler = async (event) => {                            │
│   return { statusCode: 200, body: JSON.stringify("Hello") };         │
│ };                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Sửa trực tiếp** chỉ khi: gói dạng Zip, runtime Node.js hoặc Python, gói ≤ 3 MB (giống giới hạn của AWS Console). Không đủ điều kiện thì hiện "Inline editing isn't available for this function" và gợi ý deploy bằng tool của dự án.
- Dropdown **File** liệt kê các file text trong gói, mặc định mở file chứa handler; file đã sửa có nhãn "Modified". Sửa được nhiều file rồi mới Deploy một lần. File nhị phân giữ nguyên.
- Editor không tự đóng cặp dấu `` ` `` (ace chèn thừa `` ` `` khi gõ dấu đóng ngay sau `${...}`); ngoặc và nháy đơn/kép vẫn tự đóng.
- **Sửa xong phải bấm Deploy** thì code mới có hiệu lực, giống AWS Console. Không có hot reload.
- Có thay đổi chưa deploy thì hiện nhãn "Changes not deployed" cạnh dropdown, tab Test hiện cảnh báo "Deploy your changes first". Bản sửa và file đang mở giữ nguyên khi đổi tab. Rời trang thì hỏi lại: đóng/tải lại tab dùng hộp thoại của trình duyệt, chuyển trang trong app dùng modal "Leave this page?".

### 3.5 Tab Test

```bash
Test event                                             [Delete] [Save] [Test]
Event: (•) Create new event  ( ) Edit saved event [my-event ▾]
Event name  [my-event        ]   Template [Hello world ▾]
Invocation  [Synchronous | Asynchronous]
┌ Event JSON ───────────────────────────────────────────────────────────┐
│ { "key1": "value1" }                                                  │
└───────────────────────────────────────────────────────────────────────┘

✔ Execution result: succeeded                           (hoặc ✖ failed)
 Duration 312 ms (đo ở trình duyệt)   Request ID …
 Response                                   Log output
 { "statusCode": 200, … }                   hello from handler …
```

| Trường     | Ghi chú                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| Event name | Bắt buộc khi Save, không trùng event khác của function                           |
| Template   | Hello world, S3 Put, SQS message, API Gateway. Chọn mẫu thì thay nội dung editor |
| Invocation | Synchronous (mặc định) hoặc Asynchronous (giống cách S3/SNS gọi function)        |
| Event JSON | Editor JSON có kiểm tra cú pháp. Sai cú pháp thì khóa nút Test                   |

- **Test event lưu trong `localStorage`**, theo region + tên function. Xóa trình duyệt thì mất, đổi máy thì không có.
- Kết quả có Response và Log output kèm nút Copy.
- **Kết quả thành công:** khung xanh, response JSON format đẹp.
- **Function lỗi** (handler ném lỗi, hết giờ): khung đỏ, hiện `errorType`, `errorMessage`, stack trace. Đây là kết quả của lần chạy, không phải lỗi của console, nên không hiện Flashbar.
- **Asynchronous:** chỉ báo "Invocation accepted (202)". Log xem ở tab Monitor.
- **Duration** đo bằng thời gian chờ ở trình duyệt. Floci không trả Billed duration và Max memory used.
- Lần đầu chạy một runtime chưa có image trên máy, Floci phải tải image về (vài trăm MB). Nút Test giữ trạng thái loading suốt lúc đó, có ghi chú "First run of a runtime may take a while".

### 3.6 Tab Monitor (log)

```bash
Log events (24)          Range [15m | 1h | 1d | 7d]  [ ] Auto refresh  [↻]
[🔍 Filter events, e.g. ERROR    ]
 Timestamp             Message                                  Log stream
 2026-11-09 10:20:05   [ERROR] ValueError: boom …               2026/11/09/[$LATEST]0215…
 2026-11-09 10:20:01   hello from handler {"key1":"value1"}     2026/11/09/[$LATEST]0215…
```

- Một bảng gộp log của cả log group (mặc định `/aws/lambda/<name>`), không phải mở từng log stream. Đủ cho dev local, ít bấm hơn.
- **Mới nhất ở trên.** API trả log từ cũ tới mới theo trang, nên console tải hết log trong khoảng Range rồi đảo ngược; không có nút Load more. Log ở local ít nên đủ nhanh; nếu sau này quá nhiều thì đổi sang đọc ngược từng log stream.
- Ô trong bảng căn trên.
- **Filter** dùng cú pháp filter pattern của CloudWatch Logs (vd: `ERROR`). Đã thử: Floci lọc đúng.
- **Auto refresh:** tải lại mỗi 5 giây. Dùng khi upload file S3 hoặc gửi message SQS rồi ngồi nhìn function chạy.
- Message giữ nguyên xuống dòng, chữ monospace. Runtime Python ghi stack trace bằng ký tự `\r` trong một log event, console đổi thành xuống dòng. Khung hẹp thì ẩn cột Log stream.
- Ô Filter chỉ gọi API khi ngừng gõ. Bật Auto refresh thì nút ↻ không quay mỗi 5 giây.
- Chưa có log: "No log events in this time range".

### 3.7 Tab Configuration

| Khối                  | Nội dung                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| General configuration | Description, Memory, Timeout, Runtime, Handler, Ephemeral storage, Role, Architecture. Nút Edit |
| Environment variables | Bảng key/value, nút Edit                                                                        |

**Edit general configuration (modal):**

| Trường      | Ghi chú                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| Description | Tùy chọn, tối đa 256 ký tự                                                               |
| Memory      | 128–10240 MB                                                                             |
| Timeout     | 1–900 giây                                                                               |
| Runtime     | Dropdown như lúc tạo. Function đang dùng runtime ngoài danh sách thì giữ được runtime đó |
| Handler     | Bắt buộc                                                                                 |

Ephemeral storage, Role, Architecture chỉ hiện để xem.

**Edit environment variables (modal):** thêm/xóa từng dòng key/value.

- Key: bắt đầu bằng chữ, chỉ gồm chữ, số, `_`. Không trùng nhau.
- Không cho dùng key dành riêng của Lambda (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `_HANDLER`, `LAMBDA_TASK_ROOT`…). **Floci không chặn** nhưng AWS thật thì từ chối, nên UI tự chặn để code chạy local cũng chạy được trên AWS.
- Tổng dung lượng tối đa 4 KB (giới hạn của AWS).

### 3.8 Tab Triggers

```bash
Triggers (2)                               [↻] [Enable] [Disable] [Delete] [Add trigger]
 ○ Source   Resource          Details                                   State
 ○ S3       demo-uploads      ObjectCreated:* · uploads/ · .png         —
 ○ SQS      orders-queue      Batch size 10                             Enabled
```

**Add trigger (modal):**

| Trường               | Ghi chú                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| Source               | S3 hoặc SQS                                                                     |
| Bucket (S3)          | Dropdown các bucket                                                             |
| Event types (S3)     | `s3:ObjectCreated:*`, `s3:ObjectRemoved:*`, chọn được nhiều. Giống modal của S3 |
| Prefix / Suffix (S3) | Tùy chọn                                                                        |
| Queue ARN (SQS)      | Nhập ARN, vd: `arn:aws:sqs:ap-southeast-1:000000000000:orders-queue`            |
| Batch size (SQS)     | 1–10, mặc định 10                                                               |
| Enabled (SQS)        | Mặc định bật                                                                    |

- Trigger S3 thực chất là **event notification của bucket**: thêm ở đây thì tab Properties của bucket cũng thấy, và ngược lại.
- Floci **không cần** `AddPermission` như AWS, nên console không gọi.
- Thêm trigger S3 xong, thông báo thành công có link "Upload a file" tới trang upload của bucket đó, để thử luồng ngay.

### 3.9 Các modal xác nhận

| Thao tác                       | Xác nhận                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Delete function(s)             | Gõ `delete`. Ô tick "Also delete log group /aws/lambda/…" (mặc định tick)           |
| Rời trang khi code chưa deploy | "Leave this page?": bản sửa sẽ mất                                                  |
| Delete trigger                 | Liệt kê trigger sẽ xóa. Trigger S3 thì ghi rõ là xóa event notification khỏi bucket |

### 3.10 Thay đổi ở S3

Modal **Create event notification** (tab Properties của bucket): khi Destination là Lambda function, ô ARN có thêm **gợi ý chọn function** (Cloudscape `Autosuggest`, danh sách lấy từ `ListFunctions`). Vẫn gõ ARN tay được. SQS và SNS giữ nguyên ô nhập ARN.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                 | Cách làm                                                                                                         | Ghi chú                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tạo từ code mẫu          | Nén code mẫu thành zip ngay trên trình duyệt rồi `CreateFunction` với `ZipFile`                                  | Code mẫu là hằng số theo runtime                                                       |
| Mở code trong editor     | `GetFunction` → `Code.Location`, giữ path + query, đổi host thành `<origin>/aws` → tải zip → giải nén            | URL gốc trỏ vào tên `floci`, trình duyệt không mở được. Cache theo `CodeSha256`        |
| Sửa code inline (Deploy) | Sửa → nén lại **toàn bộ** file → `UpdateFunctionCode`                                                            | Chỉ chạy khi bấm Deploy. Có hiệu lực ngay lần gọi sau (đã thử)                         |
| Sửa cấu hình             | `UpdateFunctionConfiguration`                                                                                    | Biến môi trường: API **ghi đè cả danh sách**, nên luôn gửi đủ                          |
| Invoke                   | `Invoke` với `InvocationType` (`RequestResponse` / `Event`)                                                      | Có `FunctionError` trong response = function lỗi                                       |
| Log của một lần Test     | `FilterLogEvents` trên log group, từ lúc bấm Test tới lúc nhận kết quả                                           | Floci không trả `LogResult` (`LogType: Tail`) và không ghi dòng `START`/`END`/`REPORT` |
| Log ở tab Monitor        | `FilterLogEvents` với `startTime` theo Range, `filterPattern`; tải hết các trang rồi đảo ngược (mới nhất ở trên) |                                                                                        |
| Liệt kê trigger S3       | `ListBuckets` → `GetBucketNotificationConfiguration` từng bucket (song song) → giữ rule trỏ tới function này     | Dùng lại `toNotificationRules` của S3. Local ít bucket nên nhanh                       |
| Thêm / xóa trigger S3    | Đọc cấu hình notification của bucket → thêm/bớt rule → `PutBucketNotificationConfiguration`                      | S3 không có API sửa từng rule. Dùng lại `toNotificationConfiguration`                  |
| Trigger SQS              | `List/Create/Update/DeleteEventSourceMapping`                                                                    | Bật/tắt = `UpdateEventSourceMapping` với `Enabled`                                     |
| Xóa function             | `DeleteFunction`, rồi (nếu tick) `DeleteLogGroup` theo `LoggingConfig.LogGroup`                                  | Floci tự xóa code trong bucket nội bộ, nhưng **giữ log group** (giống AWS)             |

---

## 5. Trạng thái và lỗi

| Tình huống                                           | Hiển thị                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Đang tải                                             | Bảng giữ nguyên khung và hiện "Loading…"                     |
| Không có function / trigger / log                    | Một câu trong khung bảng, kèm nút hành động chính nếu có     |
| Lỗi từ Lambda (vd: `ResourceConflictException`)      | Flashbar đầu trang với mã lỗi và message gốc                 |
| Function chạy lỗi hoặc hết giờ (`Function.TimedOut`) | Khung kết quả màu đỏ ở tab Test, không hiện Flashbar         |
| Function không tồn tại                               | Trang "Function my-function not found" kèm link về danh sách |
| Xóa nhiều lỗi một phần                               | Báo số thành công và số lỗi, liệt kê các mục lỗi kèm lý do   |
| Floci tắt                                            | Banner chung của app đã có sẵn, bảng hiện lỗi kèm nút Retry  |

Sau mỗi thao tác thành công: hiện Flashbar "success" ngắn, rồi tự tải lại dữ liệu liên quan (nút giữ loading tới khi dữ liệu mới về, như S3).

---

## 6. Kỹ thuật

### Package cần cài

| Package                           | Để làm gì                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@aws-sdk/client-lambda`          | Gọi Lambda                                                                                     |
| `@aws-sdk/client-cloudwatch-logs` | Đọc và xóa log                                                                                 |
| `fflate`                          | Nén/giải nén zip trên trình duyệt (code mẫu, sửa code inline). Nhỏ (~8 KB), không phụ thuộc gì |

Đã cài (có trong `web/package.json`). Editor code dùng lại `ace-builds` đã cài (mode `javascript`, `python`, `json`).

### Cấu trúc thư mục

```bash
web/src/services/lambda/
├── index.tsx                  # lambdaService (id, name, routes, useResourceCount) để thêm vào registry
├── routes.ts                  # LAMBDA_ROUTE_PATTERNS, lambdaRoutes, FUNCTION_TABS, breadcrumb
├── constants.ts               # runtime, giới hạn memory/timeout, role mặc định, key env dành riêng, mẫu event
├── schemas.ts                 # zod: tạo function, general config, env vars, trigger, tên test event
├── codeTemplates.ts           # code hello world theo runtime, mode editor theo đuôi file
├── zipArchive.ts              # nén/giải nén bằng fflate, lọc file text
├── helpers.ts                 # URL tải code qua proxy, log group, chuẩn hóa xuống dòng của log
├── hooks/
│   ├── useLambda.ts           # LambdaClient + CloudWatchLogsClient qua /aws (giống useS3.ts)
│   ├── useFunctions.ts        # list, get, create, delete, cấu hình, deploy code
│   ├── useFunctionCode.ts     # tải và giải nén gói code đang chạy
│   ├── useInvoke.ts           # invoke + lấy log của lần chạy
│   ├── useFunctionLogs.ts     # log ở tab Monitor
│   ├── useTestEvents.ts       # test event trong localStorage
│   ├── useTriggers.ts         # trigger S3 và SQS
│   └── useLeaveGuard.ts       # hỏi lại khi rời trang có code chưa deploy
├── pages/                     # FunctionList, CreateFunction, FunctionDetail
└── components/                # CodeTab, TestTab, MonitorTab, ConfigurationTab, TriggersTab, AddTriggerModal, FunctionModals
```

- **Mỗi thao tác là một hook** dùng TanStack Query, query key để chung file với hook (vd: `functionQueryKey(name, part)` giống `bucketQueryKey`).
- Form dùng zod + react-hook-form (`useZodForm`, `FormModal`, `FormFields`), như S3.
- Thêm Lambda vào `registry.ts` thì tự có ở menu trái và trang Home (kèm số function). Cần thêm icon `web/public/icons/lambda.svg`.
- **Server không đổi.**

### Dùng lại từ phần đã có

| Có sẵn                                             | Dùng ở đâu                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ActionBar`, `refreshAction`                       | Nút trên mọi bảng                                                                                           |
| `FormModal`, `useZodForm`, `FormFields`            | Mọi modal có form                                                                                           |
| `ConfirmModal` (`CONFIRM_DELETE`)                  | Xóa function, trigger                                                                                       |
| `CodeEditor` (trước là `JsonEditor`)               | Event JSON ở tab Test và editor code. Thêm prop `language` (`json` / `javascript` / `python`), kéo cao được |
| `useNotify` (`notifyOutcome`, `notifyBulkOutcome`) | Báo thành công/lỗi                                                                                          |
| `CopyButton`                                       | ARN                                                                                                         |
| `EmptyState`, `emptyOrError`, `NotFound`           | Trạng thái bảng và trang                                                                                    |
| `formatBytes`, `formatDate`, `isNotFoundError`     | Code size, thời gian, function không tồn tại                                                                |
| S3: `notificationRules.ts`, `useBuckets`, `useS3`  | Trigger S3                                                                                                  |
| S3: `FLOCI_ACCOUNT_ID`, `DELETE_PREVIEW_COUNT`     | Chuyển từ `services/s3/constants.ts` sang `shared/constants.ts` vì Lambda cũng cần                          |
| `FormFields`                                       | Thêm `FormAutosuggest` (gợi ý function ở modal notification của S3)                                         |
| `notifyOutcome`                                    | Thêm `successAction`: link "Upload a file" sau khi thêm trigger S3                                          |

---

## 7. Rủi ro cần kiểm tra trước

Đã chạy thử trên Floci 2.4.0 qua proxy `/aws` của console ngày 2026-11-09, với function tạm (đã xóa sạch sau khi thử).

| #   | Rủi ro                                                                                | Kết quả                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Lambda API qua proxy** (đường dẫn REST `/2015-03-31/…`)                             | **Đã kiểm tra: ổn.** Create, Get, List, Update, Delete, Invoke đều chạy                                                                                                                                                                 |
| 2   | **Invoke có chạy code thật**, lỗi và hết giờ có báo đúng không                        | **Đã kiểm tra: ổn.** Response đúng; lỗi có header `X-Amz-Function-Error: Unhandled` kèm stack trace; quá timeout 3 s trả `Function.TimedOut`. Cold start ~0,1 s khi image có sẵn                                                        |
| 3   | **Log của một lần chạy**                                                              | **Đã kiểm tra:** Floci không trả `LogResult` và không ghi `START`/`END`/`REPORT`. Log có trong CloudWatch ngay khi invoke xong → lấy bằng `FilterLogEvents` theo thời gian. Nếu trigger chạy cùng lúc thì log có thể lẫn vào: chấp nhận |
| 4   | **Tải code về** từ `Code.Location` (để mở editor)                                     | **Đã kiểm tra:** URL trỏ `http://floci:4566/…`. Mở qua `localhost:4566` bị 403 (chữ ký theo host `floci`). Đổi sang `<origin>/aws/…` thì 200, `application/zip` → dùng cách này                                                         |
| 5   | **Upload zip lớn** qua proxy (zip gửi dạng base64 trong JSON)                         | **Đã kiểm tra: ổn.** Zip 20 MB (JSON 27 MB) mất 1,5 s. Không còn dùng vì đã bỏ upload .zip; Deploy inline gửi gói ≤ 3 MB                                                                                                                |
| 6   | **Sửa cấu hình/code** có tác dụng khi container đang chạy sẵn không                   | **Đã kiểm tra: ổn.** Memory, env, code mới đều có hiệu lực ngay lần gọi sau                                                                                                                                                             |
| 7   | **Trigger SQS** có chạy thật không                                                    | **Đã kiểm tra: ổn.** Function được gọi ~1 s sau khi gửi message, event đúng dạng `Records` của SQS                                                                                                                                      |
| 8   | **Trigger S3** có gọi function không                                                  | **Đã kiểm tra: ổn.** Upload object thì function nhận event `ObjectCreated:Put`. Không cần `AddPermission`                                                                                                                               |
| 9   | **Role** có bắt buộc, có phải tồn tại không                                           | **Đã kiểm tra:** bắt buộc gửi (`Role is required`), nhưng ARN role không tồn tại vẫn tạo được → dùng hằng số                                                                                                                            |
| 10  | **Env var dành riêng** (`AWS_REGION`…)                                                | **Đã kiểm tra:** Floci chấp nhận, AWS thật từ chối → UI tự chặn                                                                                                                                                                         |
| 11  | **Runtime chưa có image trên máy:** lần invoke đầu Floci phải tải image (vài trăm MB) | **Đã kiểm tra:** lần đầu chạy `nodejs22.x` mất ~10 s, nút Test loading tới khi xong, có ghi chú "First run of a runtime may take a while"                                                                                               |
| 12  | **Xóa function** có dọn hết không                                                     | **Đã kiểm tra:** Floci tự xóa code trong bucket nội bộ và container, **giữ log group** → có ô tick xóa log group                                                                                                                        |

**Bucket nội bộ `awslambda-<region>-tasks`:** Floci lưu code của function ở đây (`snapshots/<account>/<function>`). Bucket này hiện trong danh sách bucket S3. Xóa object trong đó có thể làm hỏng function. Xem câu hỏi mở ở mục 9.

---

## 8. Thứ tự làm

1. Thêm `useLambda.ts`, icon, khai báo Lambda trong `registry.ts`.
2. Danh sách function, tạo function (code Hello world), xóa.
3. Trang chi tiết: overview, tab Configuration (general, env vars).
4. Tab Code: editor inline + Deploy.
5. Tab Test: event, mẫu event, lưu event, invoke đồng bộ/bất đồng bộ, kết quả, log của lần chạy.
6. Tab Monitor, có tự làm mới.
7. Tab Triggers (S3 và SQS), gợi ý chọn function trong modal notification của S3.
8. Thêm số function vào trang Home.

**Kiểm tra mỗi bước:** chạy trên Floci thật và chụp màn hình ở 3 độ rộng (theo yêu cầu hiện tại thì chưa viết test). Cuối cùng thử trọn luồng: tạo function → thêm trigger S3 → upload file → thấy log ở tab Monitor.

**Đã thử trên Floci 2.4.0 (2026-11-09):** tạo Node.js/Python, sửa code + Deploy, Test đồng bộ/bất đồng bộ, function ném lỗi (khung đỏ, stack trace), lưu test event, Monitor, sửa env (chặn `AWS_REGION`), thêm/tắt/xóa trigger S3 và SQS, luồng S3 → Lambda → log, gợi ý function ở modal S3, xóa nhiều function kèm log group, khung 390 px.

---

## 9. Quyết định

| Quyết định                                               | Lý do                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Đợt này chỉ làm phần core                                | Rút kinh nghiệm từ S3: chỉ làm việc dev local mở console ra để làm               |
| Không làm Function URL, snippet, hot reload ở đợt này    | User chốt: để sau                                                                |
| Sửa code inline phải bấm Deploy, không hot reload        | User chốt. Giống AWS Console: code chỉ đổi khi deploy, dễ đoán                   |
| Trigger là một tab riêng                                 | Nối S3/SQS với Lambda là luồng chính, cần dễ thấy                                |
| Chỉ hỗ trợ Node.js và Python                             | User chốt. Hai runtime sửa code được trên trang; Go/Java/.NET phải biên dịch     |
| Bỏ upload .zip và tải .zip về                            | User chốt: deploy bằng tool của dự án, sửa nhanh thì dùng editor                 |
| Editor inline chỉ cho gói ≤ 3 MB                         | Giống AWS Console                                                                |
| Log của lần Test lấy từ CloudWatch theo khoảng thời gian | Floci không trả `LogResult`, cũng không có dòng `REPORT` để ghép theo request ID |
| Tab Monitor gộp log cả log group vào một bảng            | Dev local cần xem nhanh, không cần đi từng log stream như AWS                    |
| Không có ô Role khi tạo function                         | Floci không kiểm tra role. Bớt một ô khó hiểu                                    |
| Dùng `fflate` để zip/unzip                               | Trình duyệt không có API zip sẵn. `fflate` nhỏ, không phụ thuộc                  |
| Test event lưu ở `localStorage`                          | Theo spec chính. Không cần server                                                |
| Trigger S3 ghi thẳng vào event notification của bucket   | Đúng cách AWS làm, hai màn hình S3 và Lambda luôn khớp nhau                      |
| Queue SQS nhập bằng ARN                                  | Console chưa có service SQS. Giống quyết định cho S3 notification                |
| Bỏ chọn architecture                                     | Floci chạy theo CPU của máy, trừ khi đổi cấu hình Floci                          |

### Câu hỏi đã chốt

| #   | Câu hỏi                                                                                                | Chốt                                                         |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | Runtime mặc định khi tạo function?                                                                     | `nodejs22.x`                                                 |
| 2   | Bucket nội bộ `awslambda-<region>-tasks` trong danh sách S3: giữ nguyên, ẩn đi, hay hiện kèm cảnh báo? | Giữ nguyên (đúng dữ liệu của Floci), thêm sau nếu thấy vướng |
