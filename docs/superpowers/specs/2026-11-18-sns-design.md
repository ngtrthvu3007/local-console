# SNS — Thiết kế

> Ngày: 2026-11-18 · Trạng thái: đã làm (2026-11-20) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 2, làm sau [SQS](2026-11-17-sqs-design.md)

## 1. Mục tiêu

Làm màn hình SNS giống AWS SNS Console. Dev local dùng để:

- Xem topic fan-out tới đâu: queue SQS, Lambda, endpoint HTTP của app.
- Nối topic với SQS / Lambda / app, chỉnh filter policy để định tuyến message.
- Publish message thử (kèm attribute) để kiểm fan-out và filter.
- Thấy trọn flow S3 → SNS → SQS / Lambda trên console.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.** Compose thêm một dòng (mục 6).

Đối chiếu với [tài liệu SNS của Floci](https://floci.io/floci/services/sns/) và đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17): chỉ làm tính năng (1) dev thường dùng khi code, chạy local, test, hoặc (2) cần để nối với service khác cho trọn flow.

### Làm trong đợt này

| Nhóm             | Tính năng                                                                                                                     | Lý do giữ                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Topic            | Liệt kê (Standard/FIFO, số subscription); tạo Standard hoặc FIFO (content-based dedup); xóa nhiều                             | Tạo nhanh để thử                             |
| Subscription     | Liệt kê theo topic: protocol, endpoint, trạng thái (Confirmed / Pending confirmation), raw delivery, có filter hay không; xóa | Thấy topic fan-out tới đâu, vì sao chưa nhận |
| Tạo subscription | **SQS** (dropdown queue, raw delivery), **Lambda** (dropdown function), **HTTP/HTTPS** (URL)                                  | Nối SNS ↔ SQS / Lambda / app                 |
| Sửa subscription | Filter policy (JSON, scope theo attribute hoặc body), raw delivery                                                            | Dev hay cấu hình sai filter, cần test        |
| Publish          | Body, Subject, **message attribute** (`String`, `Number`); FIFO thì group ID, dedup ID                                        | Chạy thử fan-out; attribute để test filter   |
| Liên kết         | S3 notification đích SNS: dropdown topic. Trang SQS: các topic đang đẩy vào queue. Lambda › Triggers: nguồn SNS               | Thấy trọn flow S3 → SNS → SQS / Lambda       |

### Để sau

| Tính năng                                         | Ghi chú                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| DLQ cho subscription (`RedrivePolicy`)            | Floci thử lại 3 lần rồi mới chuyển DLQ; ít khi test ở local |
| Thêm nguồn SNS trong modal Add trigger của Lambda | Tạo từ trang topic là đủ; tab Triggers của Lambda chỉ hiện  |
| Publish batch, tag                                | Ít dùng khi test tay                                        |
| Attribute kiểu `Binary`, `String.Array`           | Gửi thử bằng tay hiếm cần                                   |
| Thông báo từ SES (bounce, complaint)              | Chuyển từ "Để sau" của spec SES; điều kiện ở dưới bảng      |

**Thông báo từ SES** (tiêu chí 3: app cần biết mail bị bounce, complaint để xử lý; xem [spec SES](2026-11-17-ses-design.md) §2):

- Làm sau khi SNS xong.
- Trước khi làm, kiểm Floci (tài liệu Floci hoặc chạy thử):
  - Floci có đẩy thông báo sang SNS thật không, hay chỉ lưu cấu hình.
  - Floci có giả lập bounce, complaint không (`bounce@simulator.amazonses.com`). Không có thì ở local không tạo được bounce.
  - Đẩy theo cách nào:
    - Identity notification topic (`SetIdentityNotificationTopic`, SES v1): không cần configuration set.
    - Event destination của configuration set (SES v2): làm configuration set trước (đang ở "Để sau" của spec SES), và chuyển event destination khỏi "Không làm".
- Floci không đẩy thật thì bỏ mục này (không đạt tiêu chí 1).

### Không làm

| Tính năng                                                  | Lý do                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Email, email-json, SMS, mobile push (platform application) | Floci không gửi, không lưu để xem lại (push chỉ lưu trong bộ nhớ) |
| Firehose                                                   | Không có trong roadmap                                            |
| Access policy, data protection policy                      | Floci không áp dụng khi tắt IAM enforcement                       |
| Delivery status logging, delivery retry policy             | Floci không ghi log giao, không giả lập thời gian thử lại         |

---

## 3. Màn hình

Theo quy tắc chung của DynamoDB, ElastiCache, MQ, SQS, SES: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; cột số căn phải (`Figure`); thiếu giá trị là "—"; khung hẹp thì bảng thành hai tầng (`useIsCompact`); khối rỗng hoặc lỗi vẫn giữ khung.

### 3.1 Danh sách topic — `/sns/topics`

```text
Topics (2)                                          [↻] [Delete] [Create topic]
Region: ap-southeast-1.
[🔍 Find topics by name                     ]
 ☐ Name ▲                 Type        Subscriptions
 ☐ order-events           Standard                3
 ☐ payments.fifo          FIFO                    1
```

- `ListTopics` (phân trang), rồi `GetTopicAttributes` cho từng topic (`FifoTopic`, `SubscriptionsConfirmed` + `SubscriptionsPending`).
- Bấm tên mở chi tiết. Đường dẫn dùng **tên topic**; ARN ghép từ region, account của Floci và tên (topic không có URL như queue).
- Khung hẹp: tầng 1 là tên + số subscription, tầng 2 là type.

### 3.2 Tạo topic — `/sns/topics/create`

| Trường              | Ghi chú                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| Type                | `Tiles`: Standard / FIFO. Mặc định Standard                                    |
| Name                | 1–256 ký tự: chữ, số, `-`, `_`. FIFO phải kết thúc bằng `.fifo` (luật của SNS) |
| Content-based dedup | Chỉ hiện khi FIFO. Mặc định tắt                                                |

`CreateTopic`. Tạo xong mở trang chi tiết.

### 3.3 Chi tiết topic — `/sns/topics/:topic`

```text
order-events                                  [Copy ARN] [Delete] [Publish message]
Standard · 3 subscriptions
[Subscriptions] [Details]
```

- Tab lưu trên URL (`?tab=`). **Mặc định mở Subscriptions.**
- Topic không tồn tại: "Topic … not found" kèm link về danh sách.

### 3.4 Tab Subscriptions

```text
Subscriptions (3)                         [↻] [Actions ▾] [Create subscription]
 ☐ Protocol   Endpoint                            Status                 Raw   Filter
 ☐ SQS        orders-queue                        Confirmed              Yes   type = order
 ☐ Lambda     process-order                       Confirmed              —     —
 ☐ HTTP       http://host.docker.internal:3000/…  ◔ Pending confirmation —     —
```

- `ListSubscriptionsByTopic`, rồi `GetSubscriptionAttributes` cho từng subscription (`PendingConfirmation`, `RawMessageDelivery`, `FilterPolicy`).
- Endpoint SQS / Lambda hiện **tên** kèm link sang trang queue / function. HTTP hiện URL (cắt giữa nếu dài, tooltip đầy đủ).
- Cột Filter: tóm tắt một dòng (vd: `type = order`), bấm mở modal sửa.
- **Pending confirmation:** popover giải thích "Floci sent a SubscriptionConfirmation to this URL. Your app must call the SubscribeURL in it before it receives messages." Console không tự xác nhận (mục 9).
- Actions (chọn dòng): **Edit filter policy** (đúng 1), **Edit raw delivery** (đúng 1, chỉ SQS và HTTP), **Delete** (nhiều).

**Create subscription (modal):**

| Trường        | Ghi chú                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol      | `Select`: Amazon SQS / AWS Lambda / HTTP / HTTPS                                                                                        |
| Queue         | SQS: dropdown queue (tên, ARN làm description). Topic FIFO + queue thường: ghi chú "Order and deduplication apply only to FIFO queues." |
| Function      | Lambda: dropdown function                                                                                                               |
| URL           | HTTP/HTTPS. Mô tả: "For an app on your machine use http://host.docker.internal:<port>. `localhost` is Floci itself."                    |
| Raw delivery  | SQS và HTTP. Mặc định tắt (giống AWS)                                                                                                   |
| Filter policy | Tùy chọn, mở rộng được (`ExpandableSection`): JSON + scope                                                                              |

`Subscribe` với `ReturnSubscriptionArn: true`. URL trỏ `localhost` / `127.0.0.1`: cảnh báo vàng (không chặn) vì từ container Floci đó là chính Floci.

**Edit filter policy (modal):** `CodeEditor` JSON; Scope: `Tiles` Message attributes / Message body. Xóa hết nội dung = bỏ filter. Lưu bằng `SetSubscriptionAttributes` (`FilterPolicy`, `FilterPolicyScope`). JSON sai thì lỗi trong form; policy sai luật thì lỗi gốc của SNS.

### 3.5 Tab Details

| Khối    | Nội dung                                                                       |
| ------- | ------------------------------------------------------------------------------ |
| General | Type, ARN (copy được), content-based dedup (FIFO), số subscription             |
| Connect | Snippet dùng ARN trong app (`TopicArn=…`) cho máy dev và cho app trong compose |

### 3.6 Publish message (modal)

| Trường             | Ghi chú                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| Subject            | Tùy chọn                                                                                |
| Body               | `ValueEditor` (dùng chung với SQS và MQ). Không rỗng                                    |
| Message attributes | Bảng Name / Type (`String`, `Number`) / Value; thêm, xóa dòng. Tối đa 10 (luật của SNS) |
| Message group ID   | Chỉ FIFO, bắt buộc                                                                      |
| Deduplication ID   | Chỉ FIFO. Bắt buộc khi topic tắt content-based dedup                                    |

- `Publish`. Thông báo kèm Message ID. Modal giữ nội dung để gửi tiếp.
- SNS không báo message đi tới subscription nào. Mô tả dưới header modal: "To check delivery, peek the subscribed queues or open the function's Monitor tab."

### 3.7 Các modal xác nhận

| Thao tác               | Xác nhận                                             |
| ---------------------- | ---------------------------------------------------- |
| Delete topic(s)        | Gõ `delete`. Liệt kê topic và số subscription sẽ mất |
| Delete subscription(s) | Gõ `delete`. Liệt kê endpoint                        |

### 3.8 Thay đổi ở S3, SQS, Lambda

| Chỗ                                | Đổi                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 › Event notification › đích SNS | Ô ARN thành dropdown topic (như đích SQS ở spec SQS 3.9). Topic FIFO bị khóa kèm description (S3 chỉ gửi tới topic Standard theo luật của AWS; Floci chưa kiểm, kiểm khi làm) |
| S3 › Event notification, đích SNS  | Tên topic thành link sang trang topic                                                                                                                                         |
| SQS › tab Settings                 | Khối mới **SNS subscriptions**: topic đang đẩy vào queue (link), raw delivery, filter. Rỗng thì ẩn                                                                            |
| Lambda › tab Triggers              | Thêm nguồn **SNS**: topic (link), filter. Xóa trigger = xóa subscription                                                                                                      |

Danh sách subscription theo queue / function: `ListSubscriptions` (phân trang) rồi lọc `Endpoint` = ARN của queue / function.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                           | Gọi                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Danh sách topic                    | `ListTopics` + `GetTopicAttributes` từng topic                                                                 |
| Subscription của topic             | `ListSubscriptionsByTopic` + `GetSubscriptionAttributes` từng subscription                                     |
| Tạo subscription                   | `Subscribe` (`Attributes`: `RawMessageDelivery`, `FilterPolicy`, `FilterPolicyScope`; `ReturnSubscriptionArn`) |
| Sửa filter / raw                   | `SetSubscriptionAttributes` từng thuộc tính                                                                    |
| Publish                            | `Publish` (`MessageAttributes`, FIFO: `MessageGroupId`, `MessageDeduplicationId`)                              |
| Subscription theo queue / function | `ListSubscriptions` rồi lọc theo `Endpoint`                                                                    |

---

## 5. Trạng thái và lỗi

| Tình huống                               | Hiển thị                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Topic không có (`NotFound`)              | Trang chi tiết: "Topic … not found" kèm link về danh sách                 |
| FIFO thiếu group ID (`InvalidParameter`) | Chặn ở form trước khi gửi                                                 |
| HTTP subscription chưa xác nhận          | Trạng thái "Pending confirmation" kèm popover (3.4)                       |
| HTTP URL trỏ `localhost`                 | Cảnh báo trong form tạo subscription                                      |
| Giao tới subscription lỗi                | SNS vẫn trả Message ID (Floci giống AWS). Mô tả trong modal Publish (3.6) |
| Filter policy sai luật                   | Lỗi gốc của SNS trong modal                                               |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-sns -w web
```

`tests/` cần thêm khi viết integration test: `npm install @aws-sdk/client-sns -w tests`.

### Thay đổi ở compose

Thêm cho service `floci` trong `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway" # để SNS HTTP subscription tới được app chạy trên máy dev (Linux)
```

Lý do (mục 7 #4): từ container Floci, `localhost` là chính Floci, còn `host.docker.internal` chưa có trên Linux (compose mới khai báo cho console). Cùng cách xử lý với console ở spec chính, mục 8. Cập nhật README mục "Point your app at Floci".

### Cấu trúc thư mục

```bash
web/src/services/sns/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── filterPolicy.ts            # tóm tắt filter policy thành một dòng; kiểm JSON
├── hooks/
│   ├── useSNS.ts              # SNSClient qua /aws
│   ├── useTopics.ts           # list, attributes, create, delete, publish
│   └── useSubscriptions.ts    # theo topic, theo endpoint (queue/function), create, set attributes, delete
├── pages/                     # TopicList, CreateTopic, TopicDetail
└── components/                # SubscriptionsTab, DetailsTab, các modal
```

Khai báo trong `registry.ts`; icon `web/public/icons/sns.svg` theo cùng khung với các icon cũ. Hook `useSubscriptions` theo endpoint được SQS và Lambda dùng lại (3.8).

### Dùng lại từ phần đã có

| Thành phần                                                                                    | Dùng cho                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `ModalFooter`                                   | Header bảng, modal xác nhận        |
| `FormModal`, `FormFields`, `useZodForm`                                                       | Tạo topic, subscription, publish   |
| `ValueEditor`, `CodeEditor`                                                                   | Body khi publish, filter policy    |
| Dropdown queue (spec SQS 3.9), danh sách function của Lambda                                  | Chọn endpoint SQS / Lambda         |
| `CopyButton`, `Figure`, `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify` | ARN, cột số, trạng thái, thông báo |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 qua proxy `/aws` của console ngày 2026-11-17 và 2026-11-18, region `ap-southeast-1`. Topic, queue, bucket, function, log group tạm đã xóa (`npm run leftovers -w tests` rỗng).

| #   | Rủi ro                           | Kết quả                                                                                                                                                                                      |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **SNS API qua proxy**            | **Ổn** với JSON 1.0 (`X-Amz-Target: SNS_20100331.*`). SDK v3 dùng protocol Query; SES Query qua proxy đã chạy, SNS kiểm lại bằng SDK khi làm                                                 |
| 2   | **SNS → SQS, raw delivery**      | **Ổn.** Raw: queue nhận đúng body. Không raw: queue nhận envelope JSON của SNS (`Type: Notification`, `MessageId`, `TopicArn`…)                                                              |
| 3   | **Filter policy theo attribute** | **Ổn.** Queue có filter `{"type":["order"]}` chỉ nhận message `type=order`, bỏ `type=user`                                                                                                   |
| 4   | **HTTP tới app trên máy dev**    | Từ container Floci: `localhost` = Floci, `host.docker.internal` **không phân giải được** (compose chưa khai báo cho Floci); chỉ IP bridge `172.17.0.1` tới được → thêm `extra_hosts` (mục 6) |
| 5   | **Xác nhận HTTP**                | Floci gửi `SubscriptionConfirmation`; **chỉ giao notification sau khi xác nhận** (giống AWS). `SubscribeURL` trỏ `localhost:4566`                                                            |
| 6   | **Trạng thái chờ xác nhận**      | `ListSubscriptionsByTopic` trả ARN thật cả khi chưa xác nhận; `GetSubscriptionAttributes` có `PendingConfirmation: "true"` → dùng trường này                                                 |
| 7   | **FIFO topic**                   | **Ổn.** Thiếu group ID → `InvalidParameter`. Content-based dedup: publish trùng 2 lần, FIFO queue nhận 1. Floci cho subscribe cả queue thường                                                |
| 8   | **SNS → Lambda**                 | **Ổn.** Function được gọi, event có `EventSource: aws:sns`, `Sns.Message` đúng                                                                                                               |
| 9   | **S3 notification → SNS → SQS**  | **Ổn.** Queue nhận `s3:TestEvent` và event upload qua topic                                                                                                                                  |
| 10  | **Email, SMS**                   | Subscribe được nhưng Floci không gửi, không có chỗ xem lại → không làm                                                                                                                       |

**Chưa kiểm, kiểm khi làm:** `host.docker.internal` sau khi thêm `extra_hosts`; S3 có từ chối topic FIFO làm đích không; SDK v3 (Query) qua proxy.

---

## 8. Thứ tự làm

0. **Làm sau SQS** (dùng lại dropdown queue và khối Settings của SQS).
1. User cài package (mục 6). Sửa compose, README. Icon, khai báo trong `registry.ts`, `useSNS`.
2. Danh sách topic, tạo (Standard/FIFO), xóa; tab Details.
3. Tab Subscriptions: liệt kê, trạng thái, tạo (SQS, Lambda, HTTP), xóa.
4. Sửa filter policy, raw delivery.
5. Publish (attribute, FIFO).
6. Liên kết: S3 dropdown topic, khối SNS ở SQS, nguồn SNS ở Lambda Triggers.
7. Test: unit cho `filterPolicy.ts` và schemas; integration `tests/it/sns.test.ts` (fan-out, filter, FIFO, Lambda); E2E một luồng chính.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: tạo topic → subscribe 2 queue (một có filter `type = order`, một raw) và 1 Lambda → publish `type = user` rồi `type = order` → peek hai queue thấy đúng → log Lambda ở tab Monitor → subscribe HTTP tới app trên máy (`host.docker.internal`) → Pending confirmation → app xác nhận → Confirmed → S3 notification chọn topic từ dropdown, upload, thấy message ở queue. Thêm: tạo FIFO topic, publish thiếu group ID bị chặn.

---

## 9. Quyết định

| Quyết định                                               | Lý do                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Chọn tính năng theo 2 tiêu chí (dev dùng, nối flow)      | User chốt 2026-11-17                                                                               |
| Giữ message attribute khi publish (`String`, `Number`)   | Không có thì không test được filter policy — mắt xích định tuyến của SNS. User chốt 2026-11-18     |
| Thêm `extra_hosts` cho Floci trong compose               | HTTP subscription tới app trên máy dev chạy mọi OS; cùng cách console đã làm. User chốt 2026-11-18 |
| Không tự xác nhận HTTP subscription, chỉ hiện trạng thái | Giống AWS: app quên xác nhận thì lỗi lộ ra ở local, không đợi lên AWS. User chốt 2026-11-18        |
| FIFO topic không khóa queue thường trong dropdown        | Floci cho phép; ghi chú thứ tự/dedup chỉ giữ với FIFO queue                                        |
| Đường dẫn theo tên topic, ARN tự ghép                    | Topic không có URL; ARN có dạng cố định theo region, account, tên                                  |
| Liên kết hiện ở trang SQS và Lambda, tạo chỉ ở trang SNS | Thấy flow ở mọi phía; một chỗ tạo cho đơn giản (giống DynamoDB stream)                             |
| Không sửa server                                         | SNS là AWS API thuần, đi qua proxy `/aws`                                                          |
