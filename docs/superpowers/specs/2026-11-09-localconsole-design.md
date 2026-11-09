# Local Console — Thiết kế

> Ngày: 2026-11-09 · Trạng thái: chờ duyệt

## 1. Tóm tắt

**Local Console** là một trang web giống AWS Console, chạy trên máy dev, dùng để xem và thao tác tài nguyên AWS **giả lập** khi dev local.

- **Lõi giả lập AWS** là [Floci](https://github.com/floci-io/floci), một emulator mã nguồn mở và miễn phí, thay cho LocalStack.
- **Giao diện** dựng bằng [Cloudscape Design System](https://cloudscape.design), bộ design system mà AWS dùng cho chính AWS Console. Nhìn và thao tác sẽ quen như AWS thật.
- **Đợt 1** làm 5 service: **S3, Lambda, DynamoDB, ElastiCache (Redis), Amazon MQ (RabbitMQ)**.

### Tại sao làm

| Vấn đề hiện tại                                    | Local Console giải quyết thế nào                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| LocalStack bị giới hạn chức năng (bản miễn phí)    | Chuyển lõi sang Floci: miễn phí, không cần token, hỗ trợ nhiều service hơn   |
| Không có UI, muốn xem hay sửa gì cũng phải gõ lệnh | Có console giống AWS: bấm là xem, upload, sửa, xóa                           |
| UI có sẵn của Floci không hợp với dự án            | Tự làm UI theo đúng chuẩn AWS Console (Cloudscape), chỉ giữ những gì dev cần |

### Nguyên tắc

- **Chỉ hỗ trợ AWS.** Redis và RabbitMQ được dùng dưới dạng service của AWS: ElastiCache và Amazon MQ.
- **Làm đủ tính năng hay dùng, không làm toàn bộ AWS.** Ví dụ S3 có thêm/sửa/xóa, upload file và folder, versioning, pre-signed URL. Những thứ hiếm dùng khi dev local thì không làm.
- **Không cần đăng nhập, không phân quyền.** Đây là tool chạy trên máy của từng người.

---

## 2. Cách hoạt động

### Bức tranh tổng thể

Hệ thống gồm **2 image Docker riêng biệt**, user chạy cả hai cùng lúc:

```bash
                         ┌───────────── Docker trên máy dev ──────────────┐
                         │                                                 │
  Trình duyệt ─────────► │  Local Console  (:3701)                         │
  (localhost:3701)       │       │                                         │
                         │       ▼                                         │
  BE của dự án ────────► │  Floci  (:4566)  ── tự bật container khi cần ─► │  Valkey (Redis)
  (localhost:4566)       │                                                 │  RabbitMQ
                         │                                                 │  Lambda runtime
                         └─────────────────────────────────────────────────┘
```

- **Floci** (`floci/floci`) là "AWS giả". Mọi dữ liệu nằm ở đây: bucket, bảng, function... BE của dự án gọi thẳng vào Floci ở cổng `4566`, y như trước đây gọi LocalStack.
- **Local Console** (image của mình) chỉ là **cửa sổ nhìn vào Floci**. Console không giữ dữ liệu. BE upload file lên S3 thì mở console là thấy, và ngược lại, vì cả hai cùng nhìn vào một Floci.
- **Floci tự bật container thật** khi cần: tạo cluster ElastiCache thì bật container Valkey, tạo broker thì bật RabbitMQ, invoke Lambda thì bật runtime Lambda. Console không tự bật container nào.

### Vì sao console vẫn cần một backend nhỏ

AWS chia mỗi service thành hai lớp:

| Lớp                            | Ví dụ                                               | Đi qua đâu                                                 |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------------- |
| **Quản lý** (tạo/xóa/cấu hình) | Tạo bucket, tạo bảng, tạo cluster Redis, tạo broker | AWS API (Floci có đủ)                                      |
| **Dữ liệu bên trong**          | Đọc object S3, scan bảng DynamoDB, invoke Lambda    | AWS API (Floci có đủ)                                      |
|                                | **Đọc/ghi key Redis, xem queue RabbitMQ**           | **Giao thức riêng của Redis/RabbitMQ, không phải AWS API** |

S3, DynamoDB và Lambda đều đi qua AWS API, nên trình duyệt gọi thẳng Floci là đủ.

Redis và RabbitMQ thì khác. AWS API chỉ tạo hoặc xóa cluster/broker, muốn đụng vào dữ liệu bên trong phải kết nối thẳng vào Redis hoặc RabbitMQ (trên AWS thật cũng vậy):

- Redis dùng giao thức TCP riêng, mà **trình duyệt không mở được kết nối TCP**.
- API quản lý của RabbitMQ cần đăng nhập và **chặn gọi từ trình duyệt (CORS)**.

Vì vậy console có một **backend mỏng** đứng giữa, chỉ làm 4 việc:

1. Trả file giao diện cho trình duyệt.
2. Chuyển tiếp request AWS từ trình duyệt sang Floci, để trình duyệt chỉ gọi cùng một địa chỉ và không bị CORS.
3. Làm cầu nối tới Redis.
4. Làm cầu nối tới API quản lý của RabbitMQ.

---

## 3. Trải nghiệm người dùng

### Cài và chạy

```bash
git clone <repo>/localconsole
cd localconsole
docker compose up --build
```

- Docker tự pull `floci/floci` và build image console từ source.
- Mở **<http://localhost:3701>** là vào console.
- Floci chạy ở **<http://localhost:4566>**, đúng cổng của LocalStack.
- Dữ liệu được lưu xuống volume, tắt rồi bật lại vẫn còn. Muốn reset sạch thì chạy `docker compose down -v`.

### Trỏ BE của dự án vào Floci

Cấu hình giống hệt lúc dùng LocalStack. Phần lớn trường hợp **không phải sửa gì**: chỉ cần tắt LocalStack và bật bộ này.

```env
AWS_ENDPOINT_URL=http://localhost:4566   # BE chạy trên máy (ngoài Docker)
# AWS_ENDPOINT_URL=http://floci:4566     # BE chạy trong cùng docker compose
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=ap-southeast-1                # phải trùng với region của console (xem mục 6)
```

Riêng S3 thì bật `forcePathStyle: true` trong SDK.

### Ví dụ: test flow upload ảnh lên S3

1. `docker compose up`.
2. Vào console, S3 → **Create bucket** → `my-uploads`.
3. Chạy flow upload trên BE. BE gọi `PutObject` vào Floci.
4. Vào console, S3 → `my-uploads`: thấy file vừa upload. Có thể xem trước ảnh, tải về, xóa, hoặc tạo pre-signed URL.

> **Lưu ý về pre-signed URL:** nếu BE tạo pre-signed URL để trình duyệt upload thẳng lên S3, URL phải dùng `localhost:4566`. Trình duyệt không hiểu tên `floci` (tên này chỉ tồn tại bên trong Docker).

---

## 4. Phạm vi đợt 1

### Giao diện chung (giống AWS Console)

- **Thanh trên cùng:** logo, ô tìm service, nhãn region (chỉ hiển thị, không đổi được).
- **Trang Home:** danh sách service, và trạng thái Floci (đang chạy hay không).
- **Mỗi service** có menu trái riêng, breadcrumb, bảng có lọc/phân trang/chọn nhiều dòng, và thông báo thành công/lỗi ở đầu trang.
- **Xóa tài nguyên quan trọng** (bucket, bảng, flush Redis, purge queue): phải gõ lại tên để xác nhận, giống AWS.
- **Theme sáng.** Chưa làm theme tối.
- **Tiếng Anh.** Chưa làm đa ngôn ngữ.

### S3

| Nhóm       | Tính năng                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bucket     | Liệt kê, tạo, xóa (có tùy chọn dọn sạch rồi xóa), bật/tạm dừng versioning, cấu hình CORS                                             |
| Object     | Duyệt theo thư mục, tạo folder, upload file và folder (kéo thả, nhiều file), download, xóa nhiều, copy/move/đổi tên, tìm theo prefix |
| Xem        | Xem trước text/JSON/ảnh, xem metadata và content-type                                                                                |
| Chia sẻ    | Tạo pre-signed URL (GET/PUT, chọn thời hạn)                                                                                          |
| Versioning | Xem các version của object, tải về, khôi phục, xóa một version cụ thể                                                                |

### Lambda

Chi tiết: [Lambda — Thiết kế](2026-11-09-lambda-design.md). Chỉ hỗ trợ Node.js và Python.

| Nhóm     | Tính năng                                                                                     |
| -------- | --------------------------------------------------------------------------------------------- |
| Function | Liệt kê, tạo từ code Hello world (runtime, memory, timeout), xóa                              |
| Code     | Sửa code ngay trên trang rồi bấm Deploy                                                       |
| Cấu hình | Sửa cấu hình, biến môi trường                                                                 |
| Test     | Invoke với JSON payload, lưu sẵn test event, xem response, thời gian chạy và log của lần chạy |
| Log      | Xem log CloudWatch của function (gộp mọi log stream), tự làm mới                              |
| Trigger  | S3 (event notification) và SQS (event source mapping)                                         |

### DynamoDB

| Nhóm | Tính năng                                                                                 |
| ---- | ----------------------------------------------------------------------------------------- |
| Bảng | Liệt kê, tạo (partition key, sort key, GSI, LSI), xóa, xem chi tiết (key, index, số item) |
| Item | Scan, query (theo key, theo index), lọc, phân trang                                       |
| Sửa  | Thêm/sửa item bằng JSON editor hoặc form theo từng attribute, xóa nhiều item              |

### ElastiCache (Redis)

| Nhóm    | Tính năng                                                                                     |
| ------- | --------------------------------------------------------------------------------------------- |
| Cluster | Liệt kê, tạo, xóa, hiện endpoint và port để BE kết nối                                        |
| Key     | Lọc theo pattern, hiện kiểu dữ liệu và TTL                                                    |
| Giá trị | Xem/sửa theo kiểu (string, hash, list, set, sorted set), thêm key, xóa key, đặt TTL, flush DB |
| Server  | Memory đang dùng, số client đang kết nối                                                      |

### Amazon MQ (RabbitMQ)

| Nhóm     | Tính năng                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Broker   | Liệt kê, tạo (user/pass), xóa, reboot, hiện endpoint AMQP và trang quản lý                                             |
| Queue    | Liệt kê queue và exchange kèm số message, tạo/xóa queue, publish message thử, xem trước message (không lấy mất), purge |
| Theo dõi | Công tắc tự động cập nhật số message mỗi 5 giây                                                                        |

> Lần đầu mở một broker, user phải nhập user/pass đã đặt lúc tạo broker. Lý do: AWS API không trả lại password. Thông tin này được giữ trong tab trình duyệt và mất khi đóng tab.

### Tính năng phụ (ứng viên)

Một tính năng phụ được thêm vào nếu đủ hai điều kiện: **Floci có hỗ trợ**, và **làm nhanh** (chỉ cần một form hoặc một công tắc). Danh sách dưới đây sẽ được đối chiếu với tài liệu Floci trước khi làm:

- **Lambda:** SnapStart, Function URL, version và alias
- **DynamoDB:** Global Tables, TTL, Streams
- **S3:** tag, lifecycle rule

### Ngoài phạm vi đợt 1

| Mục                                                                          | Khi nào làm                         |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| CloudShell (terminal chạy `aws` CLI trên web)                                | Đợt sau                             |
| EC2, API Gateway, RDS, SQS, SNS, EventBridge/Scheduler                       | Các đợt sau, mỗi đợt một spec riêng |
| Theme tối, đa ngôn ngữ                                                       | Khi cần                             |
| Đẩy image lên registry (GHCR hoặc Docker Hub, đều miễn phí cho image public) | Khi cần                             |
| IAM, Route 53, SES và các service không hợp với dev local                    | Không làm                           |
| Chọn region, kết nối nhiều Floci cùng lúc                                    | Không làm                           |

---

## 5. Kỹ thuật

### Công nghệ

| Phần           | Chọn                                                                              | Lý do                                                                                       |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Giao diện      | React + TypeScript + Vite                                                         | Cloudscape chỉ có bản React                                                                 |
| Design system  | Cloudscape                                                                        | Giống hệt AWS Console                                                                       |
| Lấy dữ liệu    | TanStack Query                                                                    | Lo sẵn loading, refresh, tự cập nhật sau khi tạo/xóa. Không phải tự viết lại ở mỗi màn hình |
| Gọi AWS        | AWS SDK v3 chạy ngay trong trình duyệt                                            | Mỗi tính năng AWS chỉ là gọi một hàm SDK, không phải viết API trung gian                    |
| Backend        | Node 24 + TypeScript + Express 5 (Node chạy thẳng file .ts, không cần bước build) | Cùng ngôn ngữ với frontend nên dùng chung type, team đã quen Express                        |
| Redis          | `ioredis`                                                                         | Thư viện Redis phổ biến nhất cho Node                                                       |
| Validate input | `zod`                                                                             | Kiểm tra dữ liệu gửi lên backend                                                            |
| Test           | Vitest, Supertest, Playwright                                                     | Xem mục 9                                                                                   |

### Cấu trúc thư mục

```bash
localconsole/
├── web/                         # Giao diện
│   └── src/
│       ├── services/            # Mỗi service một folder
│       │   ├── s3/              #   pages/, components/, api.ts
│       │   ├── lambda/
│       │   ├── dynamodb/
│       │   ├── elasticache/
│       │   └── mq/
│       ├── shared/              # Layout, bảng dùng chung, modal xóa, tạo AWS client…
│       └── registry.ts          # Danh sách service: tên, icon, đường dẫn, menu
├── server/                      # Backend
│   └── src/
│       ├── index.ts             # Khởi động server
│       ├── app.ts               # Ghép các route lại
│       ├── config.ts            # Đọc biến môi trường
│       ├── aws.ts               # Client AWS phía server (để tra endpoint Redis/RabbitMQ)
│       ├── middleware/error.ts  # Chuẩn hóa lỗi thành JSON
│       └── routes/
│           ├── health.ts        # GET /api/health
│           ├── aws-proxy.ts     # /aws/* → Floci
│           ├── redis/           # router.ts (HTTP) + client.ts (nói chuyện với Redis)
│           └── rabbitmq/        # router.ts (HTTP) + client.ts (nói chuyện với RabbitMQ)
├── Dockerfile
├── docker-compose.yml
├── .gitattributes
└── README.md
```

### Frontend

- **Đường dẫn theo kiểu AWS:** `/s3/buckets/:bucket?prefix=...`, `/lambda/functions/:name`, `/dynamodb/tables/:table/items`, `/elasticache/clusters/:id`, `/mq/brokers/:id`.
- **Thêm service mới** = tạo một folder trong `services/` và thêm một dòng vào `registry.ts`. Ô tìm kiếm, trang Home và menu đều tự đọc từ registry.
- **AWS client:** một hàm dùng chung tạo client SDK trỏ vào `/aws` của console, với credential giả `test/test` và region lấy từ cấu hình.
- **Dữ liệu nhỏ phía trình duyệt** (vd: test event của Lambda) được lưu trong `localStorage`.

### Backend

Mỗi phần backend (Redis, RabbitMQ) gồm **2 file**:

- `router.ts`: nhận request, kiểm tra input, trả kết quả.
- `client.ts`: nói chuyện với Redis hoặc RabbitMQ.

Không chia thêm lớp vì backend không có business logic và không có database. Thêm phần mới (vd: SQL editor cho RDS sau này) = tạo thêm một folder trong `routes/` rồi đăng ký một dòng trong `app.ts`. Các service AWS thuần (SQS, SNS, EC2...) **không phải sửa backend**.

**Luồng một request Redis:**

```bash
Trình duyệt: GET /api/redis/my-cluster/keys?pattern=user:*
  → redis/router   kiểm tra input
  → redis/client   1. hỏi Floci: "cluster my-cluster ở đâu?" → host:port
                   2. kết nối Redis (giữ kết nối để dùng lại), chạy SCAN
  ← trả danh sách key kèm kiểu dữ liệu và TTL
```

Trình duyệt **chỉ gửi tên cluster/broker, không gửi địa chỉ**. Backend tự hỏi Floci để lấy địa chỉ, nên không ai bắt backend kết nối tới một địa chỉ tùy ý được.

**Danh sách API của backend:**

| API                                                    | Việc                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| `GET /api/health`                                      | Kiểm tra console còn sống (yêu cầu của Floci) |
| `/aws/*`                                               | Chuyển tiếp nguyên request sang Floci         |
| `GET /api/redis/:cluster/keys?pattern=&cursor=`        | Lọc key                                       |
| `GET` / `PUT` / `DELETE /api/redis/:cluster/keys/:key` | Đọc, ghi, xóa key                             |
| `PUT /api/redis/:cluster/keys/:key/ttl`                | Đặt hoặc xóa TTL                              |
| `GET /api/redis/:cluster/info`                         | Thông tin server                              |
| `POST /api/redis/:cluster/flush`                       | Xóa sạch DB                                   |
| `GET /api/mq/:broker/queues`, `/exchanges`             | Liệt kê                                       |
| `PUT` / `DELETE /api/mq/:broker/queues/:name`          | Tạo, xóa queue                                |
| `POST /api/mq/:broker/exchanges/:name/publish`         | Publish message                               |
| `POST /api/mq/:broker/queues/:name/peek`               | Xem trước message                             |
| `DELETE /api/mq/:broker/queues/:name/messages`         | Purge queue                                   |

### Đóng gói

- **Một image, một process:** Express vừa trả giao diện vừa xử lý API.
- Dockerfile build nhiều bước: build giao diện, build backend, rồi chạy trên `node:24-alpine`. Server không cần biên dịch vì Node 24 chạy thẳng TypeScript.
- Image theo đúng **console contract của Floci** (listen ở cổng `PORT`, có `GET /api/health`, gọi Floci qua `AWS_ENDPOINT_URL`). Vì vậy ngoài cách chạy bằng compose, còn có thể để Floci tự bật console tại `localhost:4566/_floci/ui` bằng cách đặt `FLOCI_SERVICES_UI_IMAGE` cho Floci.

`docker-compose.yml` mẫu (minh họa, chi tiết chốt khi làm):

```yaml
services:
  floci:
    image: floci/floci:2.4.0 # ghim version, không dùng latest
    ports: ["4566:4566"]
    environment:
      FLOCI_SERVICES_UI_ENABLED: "false" # tắt UI có sẵn của Floci
      FLOCI_STORAGE_MODE: hybrid # lưu xuống đĩa mỗi 5 giây
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock # để Floci bật container Redis/RabbitMQ/Lambda
      - floci-data:/app/data
  console:
    build: .
    ports: ["3701:3701"]
    environment:
      AWS_ENDPOINT_URL: http://floci:4566
    extra_hosts: ["host.docker.internal:host-gateway"] # cho Linux
volumes:
  floci-data:
```

---

## 6. Cấu hình

Biến môi trường của image console:

| Biến               | Mặc định                | Ý nghĩa                                                                                                                                                  |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`             | `3701`                  | Cổng console                                                                                                                                             |
| `AWS_ENDPOINT_URL` | `http://floci:4566`     | Địa chỉ Floci mà console gọi từ bên trong Docker                                                                                                         |
| `FLOCI_PUBLIC_URL` | `http://localhost:4566` | Địa chỉ Floci mà trình duyệt gọi được (dùng cho pre-signed URL và hiển thị endpoint)                                                                     |
| `AWS_REGION`       | `ap-southeast-1`        | Region console dùng (region cha của Hanoi Local Zone `ap-southeast-1-han-1a`), hiện ở thanh trên cùng (Floci cũng truyền biến này theo console contract) |

Thiếu biến hoặc sai định dạng thì console dừng ngay khi khởi động và báo rõ lỗi.

> **Quan trọng:** Floci tách tài nguyên theo region. **BE và console phải dùng cùng region**, không thì console sẽ không thấy dữ liệu của BE. Ví dụ BE dùng `ap-northeast-1` thì chạy `AWS_REGION=ap-northeast-1 docker compose up`.

Khi chạy theo kiểu Floci tự bật console: Floci tự truyền `PORT`. Muốn giữ cổng `3701` thì đặt thêm `FLOCI_SERVICES_UI_PORT=3701` cho Floci.

---

## 7. Xử lý lỗi

| Tình huống                        | Console hiển thị                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Floci không chạy                  | Banner trên mọi trang: "Cannot reach Floci at …" kèm hướng dẫn. Trang Home hiện trạng thái đỏ |
| Lỗi từ AWS (vd: `BucketNotEmpty`) | Thông báo đầu trang, kèm mã lỗi và nội dung gốc của AWS                                       |
| Floci chưa hỗ trợ thao tác        | Báo rõ "This operation is not supported by Floci", không hiện lỗi chung chung                 |
| Input gửi lên backend sai         | Lỗi 400, nói rõ trường nào sai                                                                |
| Cluster/broker không tồn tại      | Lỗi 404                                                                                       |
| Không kết nối được Redis/RabbitMQ | Lỗi 502 kèm lý do. Chờ tối đa 5 giây rồi báo lỗi, không treo                                  |
| Sai user/pass RabbitMQ            | Lỗi 401, console hỏi lại user/pass                                                            |

---

## 8. Chạy trên mọi hệ điều hành

Image Docker luôn là Linux. Windows và Mac chạy nó qua Docker Desktop, nên **không cần build riêng cho từng OS**. User tự build từ source, và Docker tự build đúng loại CPU của máy đó (Intel/AMD hay Apple M-series).

Những chỗ hay hỏng trên Windows và cách xử lý:

| Vấn đề                                                                       | Cách xử lý                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Git trên Windows tự đổi xuống dòng sang CRLF, làm script trong container lỗi | File `.gitattributes` ép mọi file về LF. Không dùng shell script cho bước quan trọng                   |
| Floci cần Docker socket                                                      | `/var/run/docker.sock` dùng được trên Docker Desktop for Windows (WSL2), nên compose giữ một bản chung |
| `host.docker.internal` không có sẵn trên Linux                               | Compose khai báo sẵn `extra_hosts`, OS nào cũng chạy                                                   |
| Lệnh trong README                                                            | Ghi cả PowerShell lẫn bash                                                                             |

---

## 9. Kiểm thử

| Loại       | Công cụ            | Kiểm tra gì                                                                                                              |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Backend    | Vitest + Supertest | Từng API: input đúng/sai, mã lỗi trả về. Phần Redis/RabbitMQ chạy với container thật                                     |
| Frontend   | Vitest             | Logic thuần: tách prefix S3 thành cây thư mục, chuyển đổi định dạng JSON của DynamoDB, ghép lệnh Redis theo kiểu dữ liệu |
| End-to-end | Playwright         | Mỗi service một luồng chính trên Floci thật. Vd S3: tạo bucket → upload → thấy file → tạo pre-signed URL → xóa           |

---

## 10. Rủi ro cần kiểm tra trước

Ba điểm dưới đây chưa chắc chắn, nên sẽ được kiểm tra **đầu tiên**, trước khi làm giao diện:

| #   | Rủi ro                                                                                                                                                        | Nếu xảy ra thì                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **Chữ ký AWS qua proxy.** SDK ký request theo địa chỉ của console, proxy chuyển sang Floci với địa chỉ khác. Nếu Floci kiểm tra chữ ký thì request bị từ chối | **Đã kiểm tra 2026-11-09: không xảy ra.** Request đã ký đi qua proxy được Floci 2.4.0 chấp nhận (S3, DynamoDB) |
| 2   | **Pre-signed URL** phải trỏ tới địa chỉ trình duyệt gọi được (`localhost:4566`), không trỏ vào proxy                                                          | Tạo pre-signed URL bằng `FLOCI_PUBLIC_URL`                                                                     |
| 3   | **Địa chỉ của Redis/RabbitMQ:** Floci có thể trả về `localhost:<port>`. Từ bên trong container console, `localhost` lại là chính container console            | Backend đổi `localhost` thành `host.docker.internal` trước khi kết nối                                         |

---

## 11. Thứ tự làm

1. **Kiểm tra rủi ro** (mục 10).
2. **Khung app:** layout giống AWS, registry, health, proxy, Dockerfile, compose, `.gitattributes`.
3. **S3**
4. **DynamoDB**
5. **Lambda**
6. **ElastiCache (Redis)**
7. **Amazon MQ (RabbitMQ)**
8. **README:** cách chạy, cách trỏ BE vào Floci, cách chuyển từ LocalStack, lưu ý về region và Windows.

---

## 12. Các quyết định đã chốt

| Quyết định                                       | Lý do                                                                            | Phương án đã loại                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Floci làm lõi                                    | Miễn phí, không cần token, hỗ trợ nhiều service                                  | LocalStack (bị giới hạn chức năng)       |
| Console là image riêng, không gộp với Floci      | Không phải build lại mỗi khi Floci ra bản mới, image nhỏ, mỗi container một việc | Gộp chung một image                      |
| Phát hành bằng source trên GitHub, user tự build | Đơn giản, chưa cần registry                                                      | Đẩy lên registry (để sau)                |
| Cloudscape                                       | Giống AWS Console                                                                | UI có sẵn của Floci                      |
| AWS SDK gọi từ trình duyệt, backend mỏng         | Ít code nhất: mỗi tính năng AWS chỉ cần gọi một hàm                              | Backend làm hết (gấp đôi code)           |
| Express                                          | Team quen                                                                        | Fastify, Go                              |
| Mỗi phần backend gồm router + client             | Đủ rõ ràng, không thừa lớp                                                       | Controller/service/repository, Hexagonal |
| Cổng 3701                                        | Theo yêu cầu                                                                     | 4500 (mặc định của Floci UI)             |
| Chỉ tiếng Anh, chỉ theme sáng, không chọn region | Đủ cho dev local, làm thêm khi cần                                               |                                          |
