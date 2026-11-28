# Amazon DocumentDB — Thiết kế

> Ngày: 2026-11-26 · Trạng thái: **đã làm** (2026-11-26; xem dữ liệu bằng GUI như MongoDB Compass qua `socat`, không làm cầu nối server) · Plan: [2026-11-26-documentdb](../plans/2026-11-26-documentdb.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4 · Khảo sát: [docdb-kinesis-secrets-ssm](../researchs/2026-11-19-floci-survey/docdb-kinesis-secrets-ssm.md) (phần A), kiểm lại 2026-11-26 (mục 7)

## 1. Mục tiêu

Màn hình DocumentDB cho cluster mà app tạo trên Floci. Floci chạy mỗi cluster là **một container MongoDB 7 thật**, nên dev local dùng để:

- Tạo / xóa cluster và instance.
- Lấy connection string cho app trong compose / Lambda.
- **Mở cluster bằng GUI (MongoDB Compass) / mongosh trên máy**: Floci không publish cổng MongoDB, console in sẵn lệnh dựng cầu nối `socat` an toàn (chỉ `127.0.0.1`) để dev tự chạy.
- Biết trước các giới hạn của Floci: không TLS, mất dữ liệu khi Floci restart.

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws` (DocumentDB dùng chung API với RDS, web đã có `@aws-sdk/client-rds`). **Server không phải sửa gì, không thêm package**: image release của console giữ nguyên bề mặt tấn công (user chốt 2026-11-26).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19, 2026-11-26): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác, **và** (3) Floci hỗ trợ toàn phần hoặc một phần. CRUD tài nguyên chính luôn làm khi Floci hỗ trợ. Chỉ tính năng hay dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm          | Tính năng                                                                                       | Tiêu chí | Floci 2.4.0                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Cluster       | Danh sách (trạng thái, số instance, endpoint), tạo (kèm instance), xóa (kèm instance), chi tiết | CRUD     | Toàn phần; sửa password không có tác dụng nên không làm "sửa" (7 #6) |
| Instance      | Danh sách instance của cluster, thêm, xóa                                                       | CRUD     | Toàn phần (chỉ là bản ghi, không bật container mới, 7 #3)            |
| Kết nối       | Endpoint, port, connection string cho app trong compose / Lambda, thẻ Connect (Node.js, Python) | (1), (2) | Toàn phần (7 #4)                                                     |
| GUI (Compass) | Lệnh `socat` đã điền sẵn (copy) + connection string `localhost` cho Compass / mongosh trên máy  | (1)      | Floci không publish cổng; cầu nối `socat` đã kiểm chạy được (7 #12)  |

### Để sau

| Tính năng                                                   | Ghi chú                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Xem / sửa dữ liệu trong console (cầu nối MongoDB ở backend) | Compass làm tốt hơn; cầu nối thêm driver `mongodb` và route chạy query vào image release (user chốt 2026-11-26) |
| Console tự làm proxy cổng (như Redis của ElastiCache)       | Bù chỗ thiếu của Floci, công lớn; `socat` đủ dùng                                                               |
| Đổi instance class                                          | `ModifyDBInstance` chạy nhưng chỉ đổi bản ghi, không ảnh hưởng gì ở local                                       |
| Tag                                                         | Đoán ít dùng                                                                                                    |

### Không làm

| Tính năng                                                         | Lý do                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Snapshot, restore, stop / start, reboot, failover                 | Floci 2.4.0 `UnsupportedOperation` (khảo sát A1)                                             |
| Đổi master password, `ManageMasterUserPassword` (Secrets Manager) | Floci trả 200 nhưng không áp dụng; managed password làm mật khẩu thành chuỗi `"null"` (7 #6) |
| `StackLink` / link từ CloudFormation                              | `AWS::DocDB::*` chỉ là stub, không tạo gì (khảo sát A2); trang CloudFormation đã báo stub    |
| TLS                                                               | Floci chỉ chạy TCP thường                                                                    |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: nhóm **Database** (cạnh DynamoDB, RDS, ElastiCache), mục **Clusters**. Icon Tabler `IconLeaf`.

### 3.1 Clusters — `/docdb/clusters`

```text
Clusters (2)                                              [↻] [Delete] [Create cluster]
[🔍 Find clusters by name   ]
 ◯ Cluster ▲      Status        Instances   Endpoint
 ◯ orders-db      ● Available           1   172.28.0.6:27017
 ◯ users-db       ● Available           2   172.28.0.7:27017
```

- `DescribeDBClusters` + `DescribeDBInstances` (`Filters: engine = docdb`), gom instance theo `DBClusterIdentifier`: `DBClusterMembers` Floci trả luôn rỗng (7 #2).
- **Delete:** `BulkActionModal` gõ `delete` → với mỗi cluster: `DeleteDBInstance` từng instance rồi `DeleteDBCluster` (`SkipFinalSnapshot`). AWS bắt xóa instance trước; console làm hộ trong một lần xác nhận (mục 9).

### 3.2 Create cluster — `/docdb/clusters/create`

| Trường              | Ghi chú                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cluster identifier  | 1–60 ký tự: chữ thường, số, `-`; bắt đầu bằng chữ; không `--`, không kết thúc bằng `-` (luật AWS, cho tới 63; console chừa 3 ký tự để id instance `<cluster>-<n>` không quá 63; Floci nhận cả tên sai) |
| Master username     | 1–63 ký tự chữ / số, bắt đầu bằng chữ (luật AWS)                                                                                                                                                       |
| Master password     | 8–100 ký tự ASCII in được, trừ `/`, `"`, `@` (luật AWS); có ô nhập lại                                                                                                                                 |
| Instance class      | `Select`, mặc định `db.t3.medium`                                                                                                                                                                      |
| Number of instances | 1–16, mặc định 1                                                                                                                                                                                       |

`CreateDBCluster` (`Engine: docdb`) rồi `CreateDBInstance` × số instance. Lần đầu Floci pull `mongo:7.0` (~25 s): nút giữ trạng thái loading, mô tả form nói trước. Xong mở chi tiết. Password không lưu ở đâu (AWS / Floci không trả lại): form nhắc dev ghi lại.

### 3.3 Chi tiết cluster — `/docdb/clusters/:cluster`

```text
orders-db                                              [Delete] [Add instance]
● Available · 1 instance · Engine 5.0.0 (Floci runs MongoDB 7.0)
[Connectivity] [Instances]
```

- Dò cluster bằng danh sách (`DescribeDBClusters` filter `engine`), không gọi theo identifier: cluster không có trả **404** `DBClusterNotFoundFault` (`console.error`, 7 #5). Không có → "Cluster … not found".
- Tab trên URL (`useTabParam`), mặc định Connectivity.

**Tab Connectivity:**

- Endpoint, reader endpoint, port, master username.
- **From apps in Docker Compose or Lambda:** `mongodb://<user>:<password>@<endpoint>:27017/?directConnection=true&retryWrites=false` (copy; password để chỗ giữ `<password>`). Ghi chú: "No TLS: remove `tls=true` from a connection string copied from AWS."
- **From a GUI on your machine (MongoDB Compass, mongosh):** "Floci doesn't publish this cluster's port. Run this once to forward it to localhost (macOS / Linux shell):" + lệnh copy được, đã điền tên cluster:

  ```bash
  docker run --rm -d --name docdb-forward-<cluster> \
    --network "$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' floci-aws-docdb-<cluster>)" \
    -p 127.0.0.1:27017:27017 alpine/socat:1.8.0.3 \
    tcp-listen:27017,fork,reuseaddr tcp-connect:floci-aws-docdb-<cluster>:27017
  ```

  rồi connection string cho Compass `mongodb://<user>:<password>@localhost:27017/?directConnection=true` (copy). Ghi chú: "Keep `127.0.0.1`: it stops other machines on your network from reaching the database. Use another port (27018…) for a second cluster. It keeps working when Floci restarts and you recreate the cluster. Run `docker stop docdb-forward-<cluster>` before `docker compose down`." Thêm "Percent-encode special characters in the password" cạnh cả hai connection string (sửa sau review 2026-11-26: Floci restart không dừng forwarder, chạy lại lệnh sẽ trùng tên; forwarder còn gắn vào network thì `compose down` không xóa được network).

- Thẻ Connect: Node.js (`mongodb`) và Python (`pymongo`) đọc env `DOCDB_URI`.

**Tab Instances:** instance của cluster (từ danh sách `DescribeDBInstances` đã gom): identifier, class, status, endpoint. **Add instance** (modal: identifier, class) → `CreateDBInstance`; **Delete** (`BulkActionModal`) → `DeleteDBInstance`.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác          | Gọi (`@aws-sdk/client-rds`)                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| Danh sách cluster | `DescribeDBClusters` + `DescribeDBInstances` (`engine = docdb`), gom theo cluster |
| Tạo cluster       | `CreateDBCluster` + `CreateDBInstance` × N                                        |
| Xóa cluster       | `DeleteDBInstance` × instance + `DeleteDBCluster` (`SkipFinalSnapshot`)           |
| Instance          | `CreateDBInstance`, `DeleteDBInstance`                                            |

---

## 5. Trạng thái và lỗi

| Tình huống                                            | Hiển thị                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster không có                                      | "Cluster … not found" kèm link về danh sách (dò bằng danh sách, không để 404)                                                                                          |
| Floci đã restart (cluster còn bản ghi, container mất) | Không phát hiện được qua API (vẫn `available`, 7 #7). Tab Connectivity ghi sẵn: "Floci drops DocumentDB containers when it restarts: delete and recreate the cluster." |
| Tên / username / password sai luật AWS                | Form chặn (Floci nhận cả giá trị sai)                                                                                                                                  |
| Lần đầu tạo cluster                                   | Nút loading trong lúc Floci pull `mongo:7.0`                                                                                                                           |
| Xóa cluster lỗi một phần                              | `BulkActionModal` báo từng cluster; không xóa được cluster nào thì ở lại trang                                                                                         |

---

## 6. Kỹ thuật

### Package cần cài

Không. `web` và `tests` đã có `@aws-sdk/client-rds`; server không đổi.

### Cấu trúc thư mục

```bash
web/src/services/docdb/
├── index.tsx, routes.ts, constants.ts, schemas.ts, codeSamples.ts
├── clusters.ts                   # gom instance theo cluster, connection string, lệnh socat
├── hooks/                        # useClusters (list, detail, create, delete), useInstances
├── pages/                        # ClusterList, CreateCluster, ClusterDetail
└── components/                   # ConnectivityTab, InstancesTab, AddInstanceModal, DeleteClustersModal
```

Một dòng trong `registry.ts`; route dùng `lazyPage`.

### Dùng lại từ phần đã có

| Thành phần                                                                                           | Dùng cho                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `BulkActionModal`, `StatusBadge`, `useTabParam`, `withTab`, `CodeSnippet`, `ConnectCard`, `copyable` | Bảng, modal, tab, lệnh copy           |
| `useRDS` (client RDS đã có)                                                                          | Gọi API DocumentDB                    |
| Trang RDS lọc bỏ engine khác (đã có)                                                                 | Instance DocumentDB không lẫn vào RDS |

---

## 7. Rủi ro đã kiểm tra

Kiểm lại trên Floci 2.4.0 ngày 2026-11-26, region `ap-southeast-1`, AWS SDK v3 (`@aws-sdk/client-rds`) qua proxy `/aws` của console Docker. Resource tạm đã xóa (cả volume MongoDB Floci để lại).

| #   | Rủi ro                      | Kết quả                                                                                                                                                                                                                                                                    |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tạo cluster qua SDK RDS** | **Ổn.** `CreateDBCluster` `Engine: docdb` → `available` sau 2,5 s (image đã có), `Endpoint` = IP compose, `Port` 27017, `EngineVersion` 5.0.0 (bên trong MongoDB 7.0.48)                                                                                                   |
| 2   | **`DBClusterMembers`**      | ❌ Luôn rỗng dù đã có instance (Floci trả `<member>`): đếm / liệt kê instance bằng `DescribeDBInstances`                                                                                                                                                                   |
| 3   | **Instance**                | `CreateDBInstance` → `available`, endpoint = endpoint cluster; chỉ là bản ghi, không bật container mới                                                                                                                                                                     |
| 4   | **Kết nối MongoDB**         | Container trong compose (console, Lambda): kết nối được, ghi / đọc document đúng. **Máy dev: timeout** (Floci không publish port; cấu hình DocumentDB chỉ có `default-image`, `docker-network`, `enabled`, `mock`, không proxy như RDS / ElastiCache). Cần auth, không TLS |
| 5   | **Cluster không có**        | `DescribeDBClusters` theo identifier → 404 `DBClusterNotFoundFault` (`console.error`): dò bằng danh sách                                                                                                                                                                   |
| 6   | **Password**                | `ModifyDBCluster` password trả 200 nhưng MongoDB vẫn dùng password cũ; `ManageMasterUserPassword` không tạo secret, làm password thành `"null"` (khảo sát A1)                                                                                                              |
| 7   | **Floci restart**           | Container MongoDB bị dừng và **xóa**; cluster vẫn `available` với endpoint cũ nhưng kết nối timeout, **mất dữ liệu**; Floci không bật lại. Volume ẩn danh của MongoDB bị bỏ lại                                                                                            |
| 8   | **Xóa cluster**             | Còn instance → `InvalidDBClusterStateFault` (như AWS). Xóa xong container mất, volume ẩn danh (`/data/db`, `/data/configdb`) bị bỏ lại                                                                                                                                     |
| 9   | **Trang RDS**               | Đã lọc bỏ engine khác postgres / mysql: instance DocumentDB không lẫn vào                                                                                                                                                                                                  |
| 10  | **Lambda**                  | Container Lambda của Floci cùng network compose → tới được endpoint (khảo sát A2, suy từ network)                                                                                                                                                                          |
| 11  | **CloudFormation**          | `AWS::DocDB::*` chỉ là stub (khảo sát A2)                                                                                                                                                                                                                                  |
| 12  | **GUI qua `socat`**         | **Ổn.** Lệnh ở mục 3.3 (network lấy từ container `floci-aws-docdb-<cluster>`, đích là tên container, `--rm`, `127.0.0.1`): từ máy dev bắt tay giao thức MongoDB (`isWritablePrimary`) và `mongosh` đăng nhập, ghi / đọc document được. Không phụ thuộc tên network compose |

---

## 8. Thứ tự làm

1. Icon, khai báo trong `registry.ts`.
2. Hàm thuần + unit test: `clusters.ts` (gom instance theo cluster, connection string, lệnh `socat`), schema (luật tên / username / password của AWS).
3. Danh sách, tạo (kèm instance), xóa (kèm instance).
4. Chi tiết: Connectivity (connection string, lệnh `socat`, chuỗi Compass), Instances (thêm, xóa), thẻ Connect.
5. Test: IT `tests/it/docdb.test.ts` (tạo cluster + instance qua SDK, `DBClusterMembers` rỗng, gom instance, xóa instance rồi cluster, cluster không có → 404), E2E một luồng chính, trang danh sách vào `tests/ui/responsive.spec.ts`, cluster `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs` (xóa cả instance).
6. `docs/development.md` › Traps: không kết nối từ máy dev (lệnh `socat`), mất dữ liệu khi Floci restart, volume MongoDB bị bỏ lại, `DBClusterMembers` rỗng, password không đổi được. README: dòng DocumentDB.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: Create cluster (1 instance) → Connectivity có connection string và lệnh `socat` đúng tên cluster → chạy lệnh, Compass / mongosh kết nối `localhost` được → Instances: Add instance, xóa → Delete cluster.

**Sửa minor sau review (2026-11-26):** tạo cluster mà instance lỗi thì vẫn mở trang cluster và cảnh báo instance lỗi; tên cluster tối đa 60 ký tự; không cần chặn tên cluster trong lệnh `socat`: Floci 2.4.0 đã từ chối tên mà Docker không dùng được (`InternalFailure`); unit test khóa nguyên lệnh `socat`. Chạy lại: unit 574/574, E2E `docdb` 6/6, UI `docdb` 8/8.

**Kết quả thử (2026-11-26, Floci 2.4.0, console bản Docker):** unit 569/569 (web, `docdb.test.ts` 9/9) + 12/12 (server), IT 199/200 (`docdb.test.ts` 5/5; `kinesis` timestamp fail vì lệch đồng hồ, chạy lại 11/11 pass), E2E 242/242 (`docdb.spec.ts` 5/5), UI 260/260, UX 11/11, mobile 36/36; sau các sửa của review chạy lại E2E `docdb` 5/5, UI `docdb` 8/8. Thử tay: lệnh `socat` copy từ tab Connectivity, mongosh từ máy ping + ghi được. Xem tay 1440 / 1024 / 390px: không cuộn ngang, không `console.error`.

---

## 9. Quyết định

| Quyết định                                                                                      | Lý do                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Làm DocumentDB trước CloudWatch Logs và MCP server                                              | User chốt 2026-11-26: DocumentDB → ổn định service → CloudWatch Logs → MCP server                                |
| Xem dữ liệu bằng GUI (Compass) qua `socat`, không làm cầu nối server                            | User chốt 2026-11-26: không thêm driver / route chạy query vào image release; Compass mạnh hơn; công S thay vì L |
| Lệnh `socat`: `127.0.0.1`, `--rm`, image ghim phiên bản, network và đích lấy theo tên container | Không lộ ra LAN, không để container mồ côi, tránh image trôi; chạy được với mọi tên thư mục compose (7 #12)      |
| Quản lý cluster bằng `@aws-sdk/client-rds` ở trình duyệt                                        | DocumentDB dùng chung API với RDS; web đã có SDK, không thêm package                                             |
| Xóa cluster xóa luôn instance trong một lần xác nhận                                            | AWS bắt xóa instance trước; ở local chỉ là thêm một bước thừa                                                    |
| Không lưu master password                                                                       | AWS / Floci không trả lại; lưu ở trình duyệt là thêm rủi ro mà không cần cho tính năng nào                       |
