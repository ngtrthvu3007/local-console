# RDS — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã làm (2026-11-23) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 3

## 1. Mục tiêu

Màn hình RDS cho **DB instance PostgreSQL / MySQL** mà CDK (hoặc IaC khác) tạo trên Floci. Floci chạy DB thật trong container. Dev local dùng để:

- Lấy thông tin kết nối (endpoint, port, user, database, secret) để nối app hoặc client (DBeaver, TablePlus, `psql`…).
- **Kết nối DB từ máy dev** (`localhost:<port>`), không chỉ từ trong compose.
- Tạo nhanh một DB để test (kiểu Easy create của AWS); dừng / bật lại / khởi động lại / xóa DB khi test.
- Đi sang secret, log, stack của DB.

Không làm Aurora (user chốt 2026-11-19). Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.** Compose mở thêm dải cổng (mục 6). Đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác, **và** (3) Floci hỗ trợ. Chỉ tính năng thường dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm            | Tính năng                                                                                                          | Tiêu chí        | Floci 2.4.0                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------- |
| Databases       | Danh sách instance: identifier, engine, status, class; tìm theo tên                                                | (1)             | Toàn phần                                          |
| Actions         | Stop temporarily, Start, Reboot, Delete                                                                            | (1)             | Toàn phần (stop / start < 1 s, dữ liệu còn nguyên) |
| Create database | Kiểu **Easy create** của AWS: engine, identifier, master username, password hoặc Secrets Manager, initial database | (1) (user chốt) | Toàn phần (tạo đồng bộ 2–18 s, 7 #1)               |
| Chi tiết        | Tab Connectivity & security, Configuration, Logs & events                                                          | (1), (2)        | Toàn phần                                          |
| Kết nối máy dev | Compose mở `127.0.0.1:7001-7099`; chi tiết hiện "From your machine: localhost:<port>"                              | (1)             | Toàn phần (đã kiểm, 7 #2)                          |
| Liên kết        | Secret `rds!…` → Secrets Manager; log group → CloudWatch Logs; `StackLink`                                         | (2)             | Toàn phần                                          |

### Không làm

| Tính năng                                                             | Lý do                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aurora (cluster)                                                      | User chốt 2026-11-19                                                                                                                                                                                                                                                                                                       |
| Query editor (Để sau)                                                 | AWS chỉ có cho Aurora; dev dùng client riêng qua `localhost:<port>`. User chốt 2026-11-19. 2026-11-23: không làm trình xem DB kiểu DBeaver (danh sách bảng, xem dòng); nếu làm thì chỉ một SQL editor chạy query, dùng chung với Athena ([roadmap](../roadmap.md)). Khi làm kiểm RDS Data API của Floci (`rds-data`) trước |
| Standard create (form đầy đủ: VPC, storage, backup, encryption…)      | Không có ý nghĩa ở local                                                                                                                                                                                                                                                                                                   |
| Snapshot, đổi password, SSL, proxy, parameter / subnet / option group | User chốt 2026-11-19                                                                                                                                                                                                                                                                                                       |
| Events, Performance Insights                                          | Floci không phát event (7 #6); không có dữ liệu                                                                                                                                                                                                                                                                            |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: **Databases**.

### 3.1 Databases — `/rds/databases`

```text
Databases (2)                         [↻] [Actions ▾] [Create database]
[🔍 Find databases by identifier   ]
 ◯ DB identifier ▲      Engine             Status        Size
 ◯ app-db               PostgreSQL 16.4    ● Available   db.t3.micro
 ◯ reports              MySQL 8.0.36       ○ Stopped     db.t3.micro
```

- `DescribeDBInstances` (vòng `Marker`), chỉ engine `postgres`, `mysql` (instance thuộc cluster Aurora không hiện).
- **Actions** (giống AWS, chọn một dòng): **Stop temporarily** (khi Available), **Start** (khi Stopped), **Reboot** (khi Available), **Delete**.
  - Stop: `ConfirmModal` → `StopDBInstance`. Mô tả: "Floci stops the container and keeps the data." (AWS tự bật lại sau 7 ngày; Floci không, 7 #4).
  - Delete: modal gõ `delete me` (giống AWS) → `DeleteDBInstance` (`SkipFinalSnapshot: true`).
- Status: `StatusIndicator` (available, stopped, starting, stopping, rebooting, deleting).

### 3.1a Create database — `/rds/databases/create`

```text
Create database (Easy create)
 Engine            (•) PostgreSQL   ( ) MySQL
 DB identifier     [app-db           ]
 Master username   [postgres         ]
 Credentials       (•) Self managed   Password [••••••]  Confirm [••••••]
                   ( ) Managed in AWS Secrets Manager
 Initial database  [appdb            ]   (optional)
                                                   [Cancel] [Create database]
```

| Trường           | Ghi chú                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Engine           | `Tiles`: PostgreSQL / MySQL. Version để Floci chọn mặc định                                                                    |
| DB identifier    | 1–63 ký tự: chữ thường, số, `-`; bắt đầu bằng chữ; không kết thúc bằng `-`, không có `--` (luật AWS)                           |
| Master username  | Mặc định `postgres` / `admin` theo engine; 1–16 ký tự, bắt đầu bằng chữ                                                        |
| Credentials      | Self managed: password ≥ 8 ký tự, nhập lại khớp. Managed: `ManageMasterUserPassword: true` (Floci tạo secret `rds!db-…`, 7 #7) |
| Initial database | Tùy chọn; chữ, số, `_`, bắt đầu bằng chữ                                                                                       |

- `CreateDBInstance` với giá trị mặc định cố định (hằng số trong `constants.ts`): `DBInstanceClass: db.t3.micro`, `AllocatedStorage: 20`.
- Floci tạo **đồng bộ** (2–18 s, lâu hơn khi phải kéo image lần đầu): nút Create hiện loading, mô tả "Floci starts a real database container. The first time can take a minute while it pulls the image." Request timeout đủ dài (`CREATE_DB_TIMEOUT_MS`).
- Tạo xong mở chi tiết DB. Trùng identifier: lỗi gốc `DBInstanceAlreadyExists`.

### 3.2 Chi tiết — `/rds/databases/:id`

```text
app-db                                                   [↻] [Actions ▾]
PostgreSQL 16.4 · ● Available                        Stack: AppStack ↗
[Connectivity & security] [Configuration] [Logs & events]
```

- `DescribeDBInstances(DBInstanceIdentifier)`. Tab lưu trên URL (`?tab=`), mặc định Connectivity & security.
- Actions giống 3.1.
- DB không tồn tại: "Database … not found" kèm link về danh sách.

**Connectivity & security:**

```text
 Endpoint              172.28.0.2  ⧉           (dùng từ Lambda, EC2 và app trong compose)
 Port                  7001
 From your machine     localhost:7001  ⧉       (app, DBeaver, psql trên máy dev)
```

- Endpoint, port: đúng giá trị Floci trả (IP container Floci trong mạng compose, 7 #1). Dùng được từ Lambda, instance EC2 (đã kiểm: đăng nhập + SQL từ trong instance) và app trong compose.
- "From your machine": `localhost:<Port>` — chạy được nhờ compose mở cổng (mục 6). User duyệt 2026-11-19.

**Configuration:** Engine, engine version, instance class, initial database (`DBName`), master username, **master credentials**: có `MasterUserSecret` → secret ARN, link "Manage in Secrets Manager" (route từ `secretsRoutes.secretOfArn`, spec Secrets 3.8) (sang trang chi tiết secret khi Secrets Manager vào `main`, trước đó là text); không có → "Self managed".

**Logs & events:** log group `/aws/rds/instance/<id>/error` (Floci tự ghi stdout của DB, 7 #5) → link "View in CloudWatch Logs" (khi CloudWatch Logs vào `main`, trước đó là text tên group).

### 3.3 StackLink và liên kết

- `StackLink` type `AWS::RDS::DBInstance`, physical ID = DB identifier.
- Thêm `AWS::RDS::DBInstance` → `/rds/databases/<id>` vào `resourceLinks.ts` của CloudFormation.
- Service nào vào `main` sau thì làm phần nối (StackLink, link secret, link log).

---

## 4. Cách hoạt động của một số thao tác

| Thao tác     | Gọi                                         |
| ------------ | ------------------------------------------- |
| Danh sách    | `DescribeDBInstances`                       |
| Chi tiết     | `DescribeDBInstances(DBInstanceIdentifier)` |
| Stop / Start | `StopDBInstance` / `StartDBInstance`        |
| Reboot       | `RebootDBInstance`                          |
| Delete       | `DeleteDBInstance` (`SkipFinalSnapshot`)    |

---

## 5. Trạng thái và lỗi

| Tình huống                     | Hiển thị                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| DB không có                    | "Database … not found" kèm link về danh sách                         |
| Action không hợp lệ với status | Khóa nút (vd Start khi Available); lỗi gốc nếu Floci từ chối         |
| Không có DB nào                | Empty state: "Create a database with CDK or your IaC, then refresh." |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-rds -w web --min-release-age=7
```

### Thay đổi ở compose

Thêm cho service `floci` trong `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:7001-7099:7001-7099" # cổng DB của RDS, cho app / client chạy trên máy dev
```

Chỉ mở cho máy mình (giống cổng Redis `6379-6399`). **Không** đặt `FLOCI_SERVICES_RDS_ENDPOINT_HOST` (7 #2). Cập nhật README mục "Point your app at Floci": DB RDS từ máy dev là `localhost:<port>`.

### Cấu trúc thư mục

```bash
web/src/services/rds/
├── index.tsx, routes.ts, constants.ts
├── hooks/                     # useRDS (client), useDatabases (list, detail, stop, start, reboot, delete)
├── pages/                     # DatabaseList, DatabaseDetail
└── components/                # DatabaseActions, DeleteDatabaseModal, ConnectivityTab, ConfigurationTab, LogsTab
```

Một dòng trong `registry.ts`; icon `web/public/icons/rds.svg`.

### Dùng lại từ phần đã có

| Thành phần                                                            | Dùng cho              |
| --------------------------------------------------------------------- | --------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `CopyButton`            | Bảng, actions, copy   |
| `StackLink` (CloudFormation)                                          | Chi tiết DB           |
| `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify` | Trạng thái, thông báo |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1` (khảo sát + kiểm kết nối máy dev trên container Floci riêng). Resource tạm, container DB và volume đã xóa.

| #   | Rủi ro                             | Kết quả                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **DB thật**                        | **Ổn.** `CreateDBInstance` Postgres / MySQL bật container DB thật, **đồng bộ** (trả `available` sau 2–18 s, lâu hơn khi phải kéo image). Endpoint = IP container Floci trong mạng compose, port 7001, 7002…                                                                                         |
| 2   | **Kết nối từ máy dev**             | Mặc định ❌ (compose không mở cổng). **Mở `7001-7010` (giữ endpoint mặc định):** máy dev `localhost:7001` đăng nhập + chạy SQL ✅; Lambda tới endpoint ✅. Đặt thêm `FLOCI_SERVICES_RDS_ENDPOINT_HOST=localhost`: máy dev ✅ nhưng **Lambda ❌** (`localhost` trong Lambda là chính nó) → không đặt |
| 3   | **Kết nối từ compose / Lambda**    | **Ổn.** Container cùng mạng và Lambda tới `<IP>:700x` hoặc `floci:700x`                                                                                                                                                                                                                             |
| 4   | **Stop / Start / Reboot / Delete** | **Ổn.** Stop < 1 s (xóa container, giữ volume, endpoint / port), Start < 1 s, dữ liệu còn. Reboot 1,2 s. Delete biến mất ngay; **volume Docker của DB còn lại** (hybrid)                                                                                                                            |
| 5   | **Log**                            | Floci tự ghi stdout DB vào `/aws/rds/instance/<id>/error` (không cần bật export)                                                                                                                                                                                                                    |
| 6   | **Events**                         | `DescribeEvents` rỗng; EventBridge `aws.rds` không có event                                                                                                                                                                                                                                         |
| 7   | **Secrets Manager**                | `ManageMasterUserPassword` tạo secret `rds!db-<id>` có host / port / user / password; secret tự xóa khi xóa DB                                                                                                                                                                                      |
| 8   | **CloudFormation**                 | `AWS::RDS::DBInstance` tạo DB thật; `Fn::GetAtt Endpoint.Address` / `Port` đúng                                                                                                                                                                                                                     |

**Kiểm khi làm (2026-11-23, Floci 2.4.0 qua proxy `/aws` của console):**

| #   | Điểm                               | Kết quả                                                                                                                                                                                                                                     |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Query protocol qua `/aws`          | **Ổn.** `Marker` rỗng (`<Marker></Marker>`) khi hết trang                                                                                                                                                                                   |
| 10  | Physical ID `AWS::RDS::DBInstance` | **= DB identifier** → `StackLink` dùng được                                                                                                                                                                                                 |
| 11  | Cổng 7001–7099 trên macOS          | Trống. Cổng 7000 bị AirPlay Receiver chiếm (ngoài dải)                                                                                                                                                                                      |
| 12  | DB không có                        | `DBInstanceNotFound`, HTTP **404** (`isNotFoundError` bắt được)                                                                                                                                                                             |
| 13  | DB tạo bằng CloudFormation         | **Không có `EngineVersion`**, và `ManageMasterUserPassword: true` **bị bỏ qua** (không tạo secret, không có `MasterUserSecret`). Tạo bằng `CreateDBInstance` thì có cả hai. CDK `fromGeneratedSecret` dùng secret riêng nên không ảnh hưởng |

---

## 8. Thứ tự làm

1. User cài package, sửa compose và README (mục 6). Icon, khai báo trong `registry.ts`, `useRDS`.
2. Danh sách, Actions (stop, start, reboot, delete), Create database (Easy create).
3. Chi tiết: 3 tab.
4. Liên kết: secret, log group, `StackLink` (khi các service đó đã vào `main`).
5. Test: integration `tests/it/rds.test.ts` (tạo DB bằng API, stop / start / reboot / delete, kết nối `localhost:<port>` từ test); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; DB `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs` (kèm xóa volume còn lại nếu cần).

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: Create database (Easy create) một DB MySQL self-managed → mở chi tiết; CDK deploy một DB Postgres có managed password → danh sách thấy cả hai → chi tiết: endpoint, "From your machine", secret, log group, "Stack: …" → DBeaver / `psql` trên máy dev kết nối `localhost:<port>` → Stop → Start, dữ liệu còn → Reboot → Delete (gõ `delete me`).

---

## 9. Quyết định

| Quyết định                                                      | Lý do                                                                                                                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chỉ RDS instance PostgreSQL / MySQL, không Aurora               | User chốt 2026-11-19                                                                                                                                                                               |
| Không query editor                                              | AWS chỉ có query editor cho Aurora. User chốt 2026-11-19                                                                                                                                           |
| Create database chỉ kiểu Easy create                            | Tạo nhanh DB để test; form đầy đủ không có ý nghĩa ở local. User chốt 2026-11-19                                                                                                                   |
| Không snapshot, đổi password, SSL, proxy, các loại group        | User chốt 2026-11-19                                                                                                                                                                               |
| Compose mở `127.0.0.1:7001-7099`, không đặt `RDS_ENDPOINT_HOST` | Máy dev kết nối được mà Lambda vẫn chạy (7 #2). User chốt 2026-11-19                                                                                                                               |
| Không map về cổng gốc 5432 / 3306                               | Floci cấp cổng theo thứ tự tạo, không theo engine; dễ đụng Postgres / MySQL cài sẵn trên máy dev (compose lỗi bind, cả Floci không chạy); app đọc cổng từ env / SSM / secret. User chốt 2026-11-23 |
| Xóa DB gõ `delete me`                                           | Giống AWS                                                                                                                                                                                          |
| Hiện thêm "From your machine: localhost:<port>"                 | Endpoint Floci trả chỉ dùng được trong compose / Lambda. User duyệt 2026-11-19                                                                                                                     |
| Không sửa server                                                | RDS là AWS API thuần, đi qua proxy `/aws`                                                                                                                                                          |
