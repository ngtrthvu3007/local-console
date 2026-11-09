# ElastiCache (Redis) — Thiết kế

> Ngày: 2026-11-09 · Trạng thái: đã làm (2026-11-09) · Thuộc: [Local Console](2026-11-09-localconsole-design.md)

## 1. Mục tiêu

Làm màn hình ElastiCache giống AWS ElastiCache Console, **chỉ gồm phần dev local thật sự dùng**. Console dùng để:

- Xem đang có cache nào, và **lấy endpoint để BE kết nối**.
- **Xem dữ liệu bên trong**: BE đã ghi cache chưa, giá trị đúng chưa, còn sống bao lâu.
- Sửa hoặc xóa vài key để test (vd: xóa cache để BE nạp lại). Flush cả DB.
- Tạo nhanh một cache để thử một luồng.

Phần cluster đi qua AWS API của Floci (trình duyệt gọi SDK qua proxy `/aws`, giống DynamoDB). Phần dữ liệu **AWS Console không có**: trên AWS thật phải dùng `redis-cli`. Console làm thêm phần này qua backend, vì trình duyệt không mở được kết nối TCP tới Redis (spec chính, mục 2).

Floci tạo **container Valkey thật** cho mỗi cache và proxy TCP qua cổng `6379–6399` ([tài liệu ElastiCache của Floci](https://floci.io/floci/services/elasticache/)). Các điểm chưa chắc chắn nằm ở mục 7, được kiểm tra trước khi làm.

---

## 2. Phạm vi

**Nguyên tắc chọn** (như S3, Lambda, DynamoDB): chỉ làm việc dev local mở console ra để làm. Phạm vi lấy theo mục ElastiCache của spec chính.

### Làm trong đợt này

| Nhóm     | Tính năng                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Cluster  | Liệt kê; tạo (tên, engine); xóa (gõ tên để xác nhận); trang chi tiết với endpoint, port, connection string copy được |
| Key      | Lọc theo pattern và theo kiểu; hiện kiểu, TTL; Load more                                                             |
| Giá trị  | Xem/sửa theo kiểu: string, hash, list, set, sorted set                                                               |
| Thao tác | Thêm key, xóa nhiều key, đặt/xóa TTL, flush DB                                                                       |
| Server   | Memory đang dùng, số client đang kết nối, số key                                                                     |

### Làm sau

| Tính năng                            | Ghi chú                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Xem key của cluster **cluster mode** | `SCAN` phải chạy trên từng shard (`ioredis.Cluster`). Đợt này vẫn liệt kê, hiện endpoint |
| Xem key của cache có AUTH / TLS      | Phải hỏi password giống Amazon MQ. Cache tạo từ console không có AUTH                    |
| Serverless cache                     | Tài liệu Floci chưa rõ serverless chạy TLS hay plaintext                                 |
| Chọn DB khác 0                       | Đa số dự án chỉ dùng DB 0                                                                |
| Xem stream (`XRANGE`)                | Kiểu `stream` hiện "not supported" nhưng vẫn xóa và đặt TTL được                         |

### Không làm

| Tính năng                                            | Lý do                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Modify, Reboot, chọn node type, số replica, số shard | Dev local không cần. Floci luôn chạy `valkey/valkey:8`                               |
| Users, User groups, Snapshot, Parameter group        | Chuyện production. Floci chỉ lưu metadata                                            |
| Metrics, Events                                      | Floci không có dữ liệu thật                                                          |
| Memcached                                            | Spec chính chỉ làm Redis                                                             |
| Đổi tên key, ô chạy lệnh Redis, Pub/Sub, `MONITOR`   | Không có trong phạm vi spec chính                                                    |
| Key hoặc phần tử dạng binary (không phải UTF-8)      | Dev local hầu như chỉ lưu text/JSON. String binary chỉ xem được kích thước (mục 3.5) |

---

## 3. Màn hình

### 3.1 Danh sách cluster — `/elasticache/clusters`

```text
Clusters (2)                                           [↻] [Delete] [Create cluster]
Data in clusters is cleared when Floci restarts. Region: ap-southeast-1.
[🔍 Find clusters by name                    ]
 ☐ Name ▲             Engine     Endpoint                  Nodes
 ☐ app-cache          Valkey     localhost:6379  [⧉]           1
 ☐ sessions ◔ Creating Redis OSS  —                             1
```

- Gộp 2 nguồn, vì Floci tách riêng 2 loại:
  - `DescribeReplicationGroups`: cluster tạo từ console hoặc bằng `aws` CLI / SDK.
  - `DescribeCacheClusters`: cluster 1 node tạo bằng `CreateCacheCluster`. Bỏ các node thuộc replication group (có `ReplicationGroupId`) và bỏ Memcached.
- Endpoint: Primary endpoint, hoặc Configuration endpoint nếu bật cluster mode. Nút copy nằm ngay trong ô vì đây là việc dev làm nhiều nhất.
- Trạng thái chỉ hiện cạnh tên khi khác `available`, giống quy tắc của DynamoDB. Đang `creating` thì tự tải lại mỗi 2 giây.
- Chọn nhiều để xóa. Ô tìm lọc ngay trên trình duyệt.
- Dòng mô tả dưới header nhắc rằng **dữ liệu mất khi Floci khởi động lại**: Floci chỉ lưu cấu hình cluster.
- **Chưa có cluster nào:** "No clusters" kèm nút Create cluster.

### 3.2 Tạo cluster — `/elasticache/clusters/create`

| Trường | Ghi chú                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- |
| Name   | 1–40 ký tự: chữ thường, số, `-`; bắt đầu bằng chữ; không có `--`; không kết thúc bằng `-`       |
| Engine | Valkey (mặc định) hoặc Redis OSS. Ghi chú: "Floci always runs Valkey 8. Engine is a label only" |

- Gọi `CreateReplicationGroup` giống AWS Console: tắt cluster mode, 1 node, 0 replica, node type cố định.
- Không có ô Port: Floci tự lấy cổng trống từ `6379`. Cổng thật hiện ở trang chi tiết.
- Tạo xong thì mở trang chi tiết, báo "Creating cluster app-cache".

### 3.3 Chi tiết cluster — `/elasticache/clusters/:cluster`

```text
app-cache                                          [Copy endpoint] [Delete]
Valkey · localhost:6379 · 1,204 keys
[Keys] [Details]
```

- Tab lưu trên URL (`?tab=details`). **Mặc định mở Keys**, vì xem dữ liệu là việc chính.
- Cluster không tồn tại: "Cluster app-cache not found" kèm link về danh sách.
- Cluster bật cluster mode, có AUTH hoặc TLS: tab Keys hiện một câu lý do (vd: "Viewing keys isn't supported for clusters with cluster mode on yet"). Tab Details vẫn dùng bình thường.

### 3.4 Tab Keys

```text
Keys (50+)       [↻] [Actions ▾] [Create key]  ┃ user:1:cart                              ✕
[Pattern user:*  ] [All types ▾] [Run]         ┃ hash · 3 fields · No expiry
 ☐ Key                    Type      TTL        ┃ [Set TTL] [Delete]
 ☐ user:1:profile         string    59m 12s    ┃ Fields (3)   [↻] [Actions ▾] [Add field]
 ☐ user:1:cart            hash      —          ┃  ☐ Field        Value
 ☐ user:2:profile         string    58m 40s    ┃  ☐ sku-001      {"qty":2}
                [Load more]                    ┃
```

Bên trái là danh sách key, bên phải là panel giá trị của key đang chọn (mục 3.5). Bố cục chi tiết và dạng điện thoại ở mục 3.10.

| Trường  | Ghi chú                                                               |
| ------- | --------------------------------------------------------------------- |
| Pattern | Glob của Redis (`*`, `?`, `[ab]`). Mặc định `*`                       |
| Type    | All types, string, hash, list, set, sorted set. Gửi kèm `SCAN … TYPE` |

- Mỗi trang lấy khoảng 50 key: backend gọi `SCAN` lặp lại tới khi đủ 50 key hoặc hết DB. Mỗi request quét tối đa 10.000 key để không treo. Còn cursor thì có nút **Load more**.
- Pattern lọc rộng nên một trang có thể ít key hơn 50 mà vẫn còn trang sau. Câu "No keys matched in this page" đi kèm Load more.
- Cột TTL: dạng dễ đọc (`59m 12s`); không có hạn thì "—".
- Bấm tên key để mở panel giá trị (mục 3.5). Key đang mở in đậm.
- Thứ tự key là thứ tự `SCAN` trả về, không sắp xếp. Sắp xếp theo trang hiện tại sẽ gây hiểu nhầm là sắp xếp cả DB.

| Nút                | Ghi chú                                          |
| ------------------ | ------------------------------------------------ |
| Create key         | Modal (mục 3.6)                                  |
| Delete (Actions)   | Chọn nhiều key. Gõ `delete` để xác nhận          |
| Flush DB (Actions) | Xóa mọi key của DB 0. Gõ tên cluster để xác nhận |

### 3.5 Panel giá trị

Dùng `SplitPanel` của Cloudscape, giống panel chi tiết trong AWS Console.

- **Desktop:** panel nằm bên phải, kéo rộng hẹp được. **Khung hẹp (điện thoại):** Cloudscape tự chuyển panel xuống dưới.
- Key đang mở được lưu trên URL: `/elasticache/clusters/:cluster?key=<tên key>`. Tải lại trang hoặc gửi link vẫn mở đúng key. Đặt ở query vì key có thể chứa `/`, `?`, `#`.
- Bấm key khác thì panel đổi theo. Bấm ✕ thì đóng panel và xóa `key` khỏi URL. Chưa chọn key thì không hiện panel.
- Header panel là tên key, dòng mô tả là kiểu · độ dài · TTL. Ngay dưới là nút Set TTL và Delete, dùng chung cho mọi kiểu. Delete xong thì đóng panel và tải lại danh sách key.
- Collection lấy theo trang **100 phần tử** kèm Load more, để key lớn không làm treo trình duyệt.
- Key không còn (đã bị xóa hoặc hết hạn): panel hiện "Key user:1:cart no longer exists", rồi danh sách key tự tải lại.

| Kiểu           | Hiển thị                                          | Thao tác                                                               |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **string**     | `CodeEditor`. Là JSON hợp lệ thì dùng mode `json` | Sửa rồi Save. Giữ TTL hiện có (`SET … KEEPTTL`)                        |
| **hash**       | Bảng Field / Value                                | Add field, Edit value, Delete nhiều field                              |
| **list**       | Bảng Value / Index                                | Push vào đầu hoặc cuối, Edit theo index (`LSET`), Delete nhiều phần tử |
| **set**        | Bảng Member                                       | Add member, Delete nhiều member                                        |
| **sorted set** | Bảng Member / Score, xếp theo score tăng dần      | Add member (kèm score), Edit score, Delete nhiều member                |
| Kiểu khác      | "Viewing stream keys isn't supported"             | Chỉ Set TTL, Delete                                                    |

- **String lớn hơn 1 MB, hoặc không phải UTF-8:** chỉ hiện kích thước (vd: "Binary or large value (3.2 MB) can't be edited here."), không cho sửa. Lưu lại chuỗi đã decode sẽ làm hỏng dữ liệu gốc.
- **Add field / Add member trùng:** báo "Field sku-001 already exists". Muốn đổi giá trị thì dùng Edit.
- Value dài trong bảng của panel thì cắt bớt và hiện `…`. Edit mở modal có `CodeEditor` với đầy đủ giá trị, vì panel hẹp.
- Không tự làm mới. BE có thể đang ghi vào key, nên có nút ↻ để tải lại.

### 3.6 Tạo key (modal)

| Trường      | Ghi chú                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Key         | Không rỗng                                                                                               |
| Type        | string (mặc định), hash, list, set, sorted set                                                           |
| Giá trị đầu | Đổi theo kiểu: string → value; hash → field + value; list/set → một phần tử; sorted set → member + score |
| TTL         | Tùy chọn, số giây. Trống = không hết hạn                                                                 |

- Key đã tồn tại thì báo "A key with this name already exists".
- Tạo xong thì mở panel của key đó để thêm tiếp phần tử.

### 3.7 Set TTL (modal)

- Chọn **No expiry** (`PERSIST`) hoặc **Expire in** N giây (`EXPIRE`). Dưới ô nhập hiện dạng dễ đọc (vd: `3600` → "1h").
- Mở modal thì điền sẵn TTL hiện tại.

### 3.8 Tab Details

| Khối    | Nội dung                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General | Engine, engine version, status, cluster mode, node type, ARN (copy được), ngày tạo                                                                                                                      |
| Connect | Primary / Reader / Configuration endpoint (cái nào có thì hiện), port, connection string `redis://localhost:6379` (copy được). Ghi chú: BE chạy trong cùng docker compose thì dùng `redis://floci:6379` |
| Nodes   | Node ID, vai trò (primary / replica), status                                                                                                                                                            |
| Server  | Memory đang dùng, số client đang kết nối, số key, version của Valkey, uptime. Có nút ↻                                                                                                                  |

Khối Server lấy qua backend (`INFO`, `DBSIZE`). Cluster thuộc loại chưa hỗ trợ (mục 3.3) thì khối này hiện câu lý do.

### 3.9 Các modal xác nhận

| Thao tác          | Xác nhận                                                           |
| ----------------- | ------------------------------------------------------------------ |
| Delete cluster(s) | Gõ tên cluster (xóa nhiều thì gõ `delete`). Liệt kê cluster sẽ xóa |
| Delete key(s)     | Gõ `delete`. Liệt kê vài key đầu                                   |
| Flush DB          | Gõ tên cluster. Ghi rõ số key sẽ mất                               |
| Delete phần tử    | Không cần gõ, chỉ bấm xác nhận. Liệt kê vài phần tử đầu            |

### 3.10 UI/UX chi tiết (desktop và điện thoại)

Dựng hoàn toàn bằng component và token của **Cloudscape**, giống S3, Lambda, DynamoDB: không thêm màu, font hay style riêng. Bố cục, thứ tự đọc, trạng thái và màn hình điện thoại theo nguyên tắc app screen của skill `taste-skill`. Phần bốc style mới được bỏ qua vì console đã có design system.

**Câu hỏi của từng màn hình** (khối lớn nhất trả lời câu hỏi đó, và được đọc trước):

| Màn hình          | Câu hỏi chính                                    | Việc làm nhiều nhất, cách một cú bấm |
| ----------------- | ------------------------------------------------ | ------------------------------------ |
| Danh sách cluster | Có cache nào, BE kết nối vào đâu?                | Copy endpoint                        |
| Tab Keys          | Key mình cần có chưa, kiểu gì, còn sống bao lâu? | Run, mở key                          |
| Panel giá trị     | Giá trị đã đúng chưa?                            | Save, Delete                         |
| Tab Details       | Kết nối bằng gì, Redis có đang ổn không?         | Copy connection string               |

#### Đồng bộ với các service đã có

| Thành phần                  | Dùng                                                                                                                                             | Giống ở                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Icon service                | `web/public/icons/elasticache.svg` (bên dưới)                                                                                                    | `s3.svg`, `lambda.svg`, `dynamodb.svg` |
| Icon trong giao diện        | Chỉ icon có sẵn của Cloudscape mà repo đang dùng: `refresh` (`refreshAction`), `copy` (`CopyButton`). Nút Create, Delete, Save **không có icon** | DynamoDB                               |
| Trạng thái cluster          | `StatusIndicator`: `in-progress` cho `creating` / `modifying` / `deleting`, `error` cho `create-failed`. `available` không hiện gì               | Bảng DynamoDB `Creating`               |
| Header trang chi tiết       | `Header` h1 + một dòng mô tả nối bằng `·` + `CopyButton` + Delete                                                                                | `TableDetail`                          |
| Nút trên bảng               | `ActionBar` + `refreshAction`. Khung hẹp thì gom thành split button                                                                              | Mọi bảng                               |
| Cột số                      | `Figure`, `FigureHeader` (căn phải, `tabular-nums`)                                                                                              | Danh sách bảng DynamoDB                |
| Đổi sang dạng hai tầng      | `useIsCompact(ITEM_LIST_WIDTH_PX)`, đo bề ngang **khung**, không đo màn hình                                                                     | Tab Items DynamoDB                     |
| Thông tin dạng nhãn–giá trị | `KeyValuePairs` trong `Container`                                                                                                                | Tab Settings DynamoDB, Lambda          |
| Rỗng / lỗi / không thấy     | `EmptyState`, `emptyOrError`, `ErrorState`, `NotFound`                                                                                           | Mọi trang                              |
| Form                        | Trang tạo: `Form` + `Container` như `CreateTable`. Modal: `FormModal`, `useZodForm`, `FormFields`                                                | DynamoDB                               |
| Editor                      | `CodeEditor`, cao 360px, kéo cao được                                                                                                            | Editor item DynamoDB                   |

**Icon service.** Cùng nhóm Database với DynamoDB nên dùng cùng màu `#4053D6`, cùng khung (24×24, bo 4px) và cùng nét trắng 1.6px. Hình là con chip bộ nhớ có tia sét, nghĩa là cache trong RAM, để phân biệt với hình trụ của DynamoDB. Đã render thử cạnh 3 icon cũ: cùng độ đậm và kích cỡ.

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="4" fill="#4053D6"/>
  <g fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <rect x="7" y="7" width="10" height="10" rx="1.5"/>
    <path d="M10 4.5V7M14 4.5V7M10 17v2.5M14 17v2.5M4.5 10H7M4.5 14H7M17 10h2.5M17 14h2.5"/>
    <path d="M12.8 9.3 10.9 12.2h2.2l-1.9 2.5"/>
  </g>
</svg>
```

**Registry:** `name: "ElastiCache"`, `fullName: "Amazon ElastiCache"`, `description: "Valkey and Redis OSS caches: endpoints, keys and values"`. Menu trái có **Clusters**. Link nhanh trên Home là **Create cluster**. Số trên Home là "2 clusters".

#### Quy tắc chung

- **Màu chỉ cho trạng thái cần chú ý.** Cluster `available` không tô xanh. Kiểu key là chữ xám thường, không dùng `Badge`: 5 kiểu mà 5 màu thì thành cầu vồng.
- **Tên key là cột rộng nhất và được xuống dòng, không cắt.** Key thường chung tiền tố (`user:1:…`, `bull:email:…`), phần phân biệt nằm ở cuối, nên cắt `…` sẽ làm các dòng trông giống nhau. Xuống dòng ở bất kỳ ký tự nào (`overflow-wrap: anywhere`).
- **Giá trị trong ô thì cắt một dòng kèm `…`**, vì giá trị không phải cột nhận diện. Bấm vào để xem đủ.
- **TTL là cột số:** căn phải, dạng `59m 12s`. Không có hạn thì "—" xám. Không đếm ngược trực tiếp: số là lúc tải, có nút ↻ để tải lại.
- **Không tự format JSON.** Editor hiện đúng giá trị thô, bật xuống dòng. Format rồi lưu sẽ đổi dữ liệu mà BE đã ghi.
- **Thao tác phá hủy không bao giờ là nút chính.** Flush DB chỉ nằm trong dropdown Actions.
- **Khối rỗng hoặc lỗi vẫn giữ khung và header**, kèm một câu và nút làm tiếp.

#### Danh sách cluster

Desktop (1440):

```text
Clusters (2)                                           [↻] [Delete] [Create cluster]
Data in clusters is cleared when Floci restarts. Region: ap-southeast-1.
[🔍 Find clusters by name                     ]
 ☐ Name ▲                    Engine       Endpoint                         Nodes
 ☐ app-cache                 Valkey       localhost:6379 ⧉                     1
 ☐ sessions  ◔ Creating      Redis OSS    —                                    1
```

- Endpoint dùng `CopyButton` `variant="inline"`: chữ kèm icon copy ngay sau, bấm icon là copy.
- Cột Name rộng khoảng 1/3. Nodes là cột số.

Điện thoại (390):

```text
Clusters (2)
[↻] [Create cluster ▾]
[🔍 Find clusters by name ]
 ☐ app-cache                       Valkey
   localhost:6379 ⧉ · 1 node
 ☐ sessions ◔ Creating          Redis OSS
   1 node
```

- Mỗi dòng hai tầng: tên + engine ở tầng 1; endpoint (vẫn copy được) và số node ở tầng 2, xám 13px. Không bỏ thông tin nào.
- Delete gom vào dropdown của nút Create cluster (`ActionBar` khi khung hẹp).

#### Chi tiết cluster: header

```text
app-cache                                          [Copy endpoint] [Delete]
Valkey · localhost:6379 · 1,204 keys
[Keys] [Details]
```

- Dòng mô tả thay cho một khối overview, để mở tab Keys là thấy danh sách ngay. Số key lấy từ `DBSIZE`. Cluster chưa hỗ trợ xem key thì bỏ phần số key.
- Điện thoại: dòng mô tả tự xuống dòng; hai nút vẫn vừa (giống `TableDetail`).

#### Tab Keys và panel giá trị: desktop

```text
Keys (50+)               [↻] [Actions ▾] [Create key] ┃ user:1:cart                               ✕
[Pattern user:*        ] [All types ▾] [Run]          ┃ hash · 3 fields · No expiry
 ☐ Key                          Type          TTL     ┃ [Set TTL] [Delete]
 ☐ user:1:profile               string    59m 12s     ┃ Fields (3)          [↻] [Actions ▾] [Add field]
 ☐ user:1:cart                  hash            —     ┃  ☐ Field          Value
 ☐ user:2:profile               string    58m 40s     ┃  ☐ sku-001        {"qty":2}
                 [Load more]                          ┃
```

- **Ô lọc nằm ở chỗ `filter` của `Table`**, chỗ ô tìm của mọi bảng khác. Chỉ một hàng: Pattern (giãn hết chỗ còn lại), Type (rộng cố định), Run. Nhấn Enter trong Pattern cũng chạy. Không dùng `Container` riêng như form tìm của DynamoDB, vì ở đây chỉ có 2 trường.
- **Panel:** `SplitPanel` mặc định nằm bên phải, rộng 480px. Header panel là tên key; `headerDescription` là kiểu · độ dài · TTL. **Set TTL, Delete nằm ở đầu thân panel, không dùng `headerActions`:** khi sidebar mở, panel bên phải có thể chỉ rộng khoảng 240px, để nút chung hàng thì tên key bị bóp vỡ từng chữ (lỗi đã gặp khi làm). Chuỗi chữ của panel lấy từ `I18nProvider` đã có.
- Panel mở thì vùng danh sách hẹp lại. `useIsCompact` đo khung nên danh sách tự chuyển sang hai tầng khi hẹp hơn 640px, không phải viết thêm logic.
- **Key đang mở:** tên in đậm, có `aria-current`. `Table` của Cloudscape không có kiểu dòng "đang mở" riêng, còn checkbox thì dành cho xóa nhiều.
- **Lịch sử trình duyệt:** mở panel từ trạng thái đóng thì `push`; đổi sang key khác khi panel đang mở thì `replace`. Nhờ vậy nút Back luôn đóng panel và giữ nguyên vị trí cuộn của danh sách.
- Chưa chọn key thì không truyền `splitPanel`, nên không có panel rỗng và không có thanh panel thu gọn.

**Nội dung panel theo kiểu:**

```text
user:1:profile
string · 182 B · TTL 59m 12s
[Set TTL] [Delete]
┌───────────────────────────────────────────────────────────────┐
│ {"id":1,"name":"An","plan":"pro","updatedAt":1767225600}      │
└───────────────────────────────────────────────────────────────┘
                                                 [Reset] [Save]
```

- **string:** `CodeEditor` (mode `json` nếu là JSON hợp lệ, không thì `text`). **Save là nút chính, chỉ bật khi đã sửa.** Reset trả lại giá trị đang lưu.
- **hash, list, set, sorted set:** `Table` `variant="embedded"` có số đếm ở header (`Fields (3)`, `Elements (1,204)`, `Members (12)`). Nút chính là Add/Push. Cuối bảng có Load more (100 phần tử một lần).

| Kiểu       | Cột (khung rộng)          | Hai tầng (khung hẹp, dưới 400px) |
| ---------- | ------------------------- | -------------------------------- |
| hash       | Field · Value             | Field / Value xám                |
| list       | Value · Index (căn phải)  | Value / `Index 3` xám            |
| set        | Member                    | Một tầng                         |
| sorted set | Member · Score (căn phải) | Member / `Score 12.5` xám        |

- Bấm vào value (hash, list) hoặc member (sorted set, để sửa score) mở modal Edit (`CodeEditor` 360px), vì panel hẹp. Set chỉ thêm và xóa, không sửa. Edit, Delete nằm trong Actions của bảng trong panel.

#### Tab Keys và panel giá trị: điện thoại (390)

Danh sách key phải bắt đầu trong 60% chiều cao đầu tiên của màn hình (844px → dưới 506px). Ước tính: top bar 56 + breadcrumb 40 + header và mô tả 80 + tabs 48 + header bảng 50 + hai hàng lọc 92 = **366px**, đạt yêu cầu.

```text
app-cache
Valkey · localhost:6379 · 1,204 keys
[Keys] [Details]
Keys (50+)            [↻] [Create key ▾]
[Pattern user:*                      ]
[All types ▾]                    [Run]
 ☐ user:1:profile
   string · 59m 12s
 ☐ user:1:cart
   hash · —
 ☐ bull:email:jobs:
   1873:logs
   list · 6h 0m
            [Load more]
```

- Hàng lọc tách hai hàng: Pattern toàn chiều rộng; Type và Run ở hàng dưới. Run nằm ở mép phải cho ngón cái.
- Dòng key hai tầng: tên key (xuống dòng nếu dài) / kiểu · TTL xám. Actions và Delete gom vào dropdown của Create key.
- **Panel:** Cloudscape tự chuyển panel xuống dưới khi khung hẹp. Panel mở cao khoảng **2/3 màn hình** (`splitPanelSize`), để bảng bên trong có chỗ và vẫn thấy phần đầu danh sách phía trên. Kéo cao thấp được. **Back đóng panel** (theo lịch sử ở trên).

```text
┌ user:1:cart ─────────────────────── ✕ ┐
│ hash · 3 fields · No expiry           │
│ [Set TTL] [Delete]                    │
│ Fields (3)         [↻] [Add field ▾]  │
│  ☐ sku-001                            │
│    {"qty":2}                          │
│  ☐ sku-007                            │
│    {"qty":1}                          │
└───────────────────────────────────────┘
```

- Nút header của panel xuống hàng dưới mô tả. Bảng trong panel dùng dạng hai tầng (field ở trên, value xám ở dưới).
- Modal Edit, Add trên điện thoại: Cloudscape cho modal gần toàn màn hình. `CodeEditor` vẫn cao 360px để vừa thấy nút Save.
- Mọi nút giữ kích thước mặc định của Cloudscape (đạt 44px khi khung hẹp). Riêng icon copy `inline` nhỏ hơn, nên header luôn có thêm nút **Copy endpoint** đủ cỡ.

#### Tab Details

Desktop:

```text
┌ Connect ───────────────────────────────────────────────────────────────────┐
│ Endpoint              Port       Connection string                         │
│ localhost ⧉           6379       redis://localhost:6379 ⧉                  │
│ From containers in the same docker compose: redis://floci:6379 ⧉           │
└────────────────────────────────────────────────────────────────────────────┘
┌ Server ─────────────────────────────────────────────────────────────── [↻] ┐
│ Memory used     Clients     Keys       Version        Uptime               │
│ 1.2 MB          3           1,204      Valkey 8.0.1   2h 14m               │
└────────────────────────────────────────────────────────────────────────────┘
┌ General ───────────────────────────────────────────────────────────────────┐
│ Engine   Engine version   Status   Cluster mode   Node type   Created  ARN │
└────────────────────────────────────────────────────────────────────────────┘
Nodes (1)
 Node ID              Role       Status
 app-cache-001        Primary    —
```

- Thứ tự theo câu hỏi của tab: **Connect** trước (BE kết nối vào đâu), rồi **Server** (Redis có ổn không), sau cùng là thông tin ít xem.
- Server là `KeyValuePairs` chữ thường, **không làm thẻ KPI** (không icon, không màu, không biểu đồ). Số tại thời điểm tải, có ↻.
- Status của node chỉ hiện khi khác `available`.
- Điện thoại: `KeyValuePairs` tự xếp một cột. Bảng Nodes thành hai tầng: Node ID / vai trò xám.

#### Trạng thái từng khối

| Khối                    | Đang tải                                          | Rỗng                                                                                                                                                                       | Lỗi                                                                                   |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Danh sách cluster       | `Table` `loading`: "Loading clusters"             | "No clusters" + Create cluster                                                                                                                                             | Trong khung bảng + Retry                                                              |
| Keys                    | "Loading keys"; ô lọc vẫn dùng được               | DB trống: "This database is empty" + Create key. Không khớp: "No keys match user:\*" + Reset. Trang không khớp nhưng còn trang: "No keys matched in this page" + Load more | Lý do (vd: "Can't connect to app-cache: timeout after 5 s") + Retry; ô lọc giữ nguyên |
| Keys (cluster đặc biệt) | —                                                 | `creating`: "Cluster is being created" kèm `StatusIndicator` `in-progress`, tự tải lại. Chưa hỗ trợ: một câu lý do                                                         | —                                                                                     |
| Panel                   | Header hiện tên key ngay, thân panel là `Spinner` | Collection rỗng không xảy ra (Redis tự xóa key rỗng)                                                                                                                       | Key không còn: "Key user:1:cart no longer exists"; danh sách tự tải lại               |
| Panel string            | —                                                 | String rỗng: editor trống, vẫn Save được                                                                                                                                   | Binary / > 1 MB: "Binary value (3.2 MB) can't be edited here"                         |
| Server                  | `StatusIndicator` `loading` trong từng giá trị    | —                                                                                                                                                                          | Trong khối + Retry                                                                    |

Sau mỗi thao tác thành công: Flashbar "success" ngắn (vd: "Deleted 3 keys"), rồi tự tải lại phần liên quan. Nút giữ trạng thái loading tới khi dữ liệu mới về.

---

## 4. Backend

### API

Đổi so với spec chính: **tên key đặt ở query `name`**, không đặt trong đường dẫn. Sửa từng field/phần tử, không ghi đè cả key.

| API                                                   | Việc                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/redis/:cluster/keys?pattern=&type=&cursor=` | Một trang key: `{ keys: [{ name, type, ttl }], cursor }`                       |
| `POST /api/redis/:cluster/keys`                       | Tạo key (kiểu, giá trị đầu, TTL)                                               |
| `POST /api/redis/:cluster/keys/delete`                | Xóa nhiều key: `{ names: [] }`                                                 |
| `GET /api/redis/:cluster/key?name=&cursor=`           | Kiểu, TTL, độ dài và một trang giá trị                                         |
| `PATCH /api/redis/:cluster/key?name=`                 | Sửa nội dung. Body có trường `operation` (bảng dưới), zod `discriminatedUnion` |
| `PUT /api/redis/:cluster/key/ttl?name=`               | `{ seconds: number \| null }`. `null` = bỏ hạn                                 |
| `POST /api/redis/:cluster/flush`                      | `FLUSHDB`                                                                      |
| `GET /api/redis/:cluster/info`                        | Memory, số client, số key, version, uptime                                     |

| `operation`                                            | Lệnh Redis                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `setString`                                            | `SET … KEEPTTL`                                                                |
| `addField` / `setField` / `deleteFields`               | `HSETNX` / `HSET` / `HDEL`                                                     |
| `push` / `setIndex` / `deleteIndexes`                  | `LPUSH`·`RPUSH` / `LSET` / `LSET` từng index thành giá trị đánh dấu rồi `LREM` |
| `addMembers` / `deleteMembers`                         | `SADD` / `SREM` (set)                                                          |
| `addScoredMember` / `setScore` / `deleteScoredMembers` | `ZADD NX` / `ZADD XX` / `ZREM` (sorted set)                                    |

`deleteIndexes`: Redis không có lệnh xóa theo index. `LREM` theo giá trị có thể xóa nhầm phần tử trùng ở vị trí khác, nên đánh dấu từng vị trí rồi `LREM` dấu đó, trong một `MULTI`. Nếu BE sửa list ngay trước đó thì index trên màn hình có thể đã lệch. Chấp nhận được với dev local.

Set và sorted set dùng `operation` riêng, để key bị đổi kiểu giữa chừng thì Redis báo `WRONGTYPE` (409) thay vì ghi nhầm.

Kiểu dữ liệu của API (body, response, mã lỗi) khai báo một lần ở `server/src/routes/redis/contract.ts`. Web import lại qua alias `@server/*` trong `web/tsconfig.json`. File này chỉ có type và hằng số thuần, không import gì của Node.

### Luồng một request

```text
GET /api/redis/app-cache/keys?pattern=user:*
  → router.ts   kiểm tra input (zod)
  → client.ts   1. DescribeReplicationGroups, không có thì DescribeCacheClusters → host:port
                   không có → 404; cluster mode / AUTH / TLS → 400 UnsupportedCluster
                2. host là localhost → đổi thành host của AWS_ENDPOINT_URL (mục 7, #3)
                3. lấy kết nối ioredis đã mở (theo host:port), chưa có thì mở mới
                4. SCAN … rồi pipeline TYPE + TTL
  ← { keys, cursor }
```

- Mỗi request đều hỏi lại Floci endpoint, không cache. Cluster bị xóa rồi tạo lại sẽ không dùng nhầm endpoint cũ.
- Kết nối ioredis: chờ kết nối tối đa 5 giây, không tự retry. Lỗi thì đóng kết nối, bỏ khỏi bộ nhớ và trả 502.
- `express.json()` chỉ gắn cho `/api/redis`, không đặt trước proxy `/aws` (body tới Floci phải nguyên vẹn).
- Thêm `middleware/error.ts` như spec chính: lỗi zod → 400, `HttpError` → giữ nguyên mã, còn lại → 500. Lỗi Redis: `WRONGTYPE` → 409, lỗi lệnh khác → 400, mất kết nối → 502.
- Client ElastiCache phía server tạo ngay trong `app.ts` (chỉ dùng để tra endpoint), không tách file `aws.ts`.

---

## 5. Trạng thái và lỗi

| Tình huống                                  | Hiển thị                                                           |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Đang tải                                    | Bảng giữ khung và hiện "Loading…"                                  |
| Không có cluster / key                      | Một câu trong khung bảng, kèm nút hành động chính                  |
| Lỗi từ ElastiCache API                      | Flashbar với mã lỗi và message gốc                                 |
| Cluster không tồn tại                       | Trang "Cluster app-cache not found"                                |
| Cluster đang `creating`                     | Tab Keys: "Cluster is being created" và tự tải lại khi `available` |
| Cluster chưa hỗ trợ xem key                 | Câu lý do trong tab Keys và khối Server (mục 3.3)                  |
| Không kết nối được Redis (502)              | Lỗi trong khung bảng kèm lý do và Retry                            |
| Key không còn (404)                         | Panel giá trị: mục 3.5                                             |
| Kiểu key bị đổi trong lúc sửa (`WRONGTYPE`) | 409 "Key type changed. Reload the key", modal giữ nguyên nội dung  |
| Trùng key / field / member (409)            | Báo ngay trong modal                                               |
| Floci tắt                                   | Banner chung của app                                               |

Sau mỗi thao tác thành công: Flashbar "success" ngắn, rồi tự tải lại dữ liệu liên quan.

---

## 6. Kỹ thuật

### Package cần cài

| Package                       | Ở đâu           | Để làm gì                               |
| ----------------------------- | --------------- | --------------------------------------- |
| `@aws-sdk/client-elasticache` | `web`, `server` | Web: list/tạo/xóa. Server: tra endpoint |
| `ioredis`                     | `server`        | Nói chuyện với Redis                    |

Đã cài (user chạy, từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-elasticache -w web --min-release-age=7
npm install @aws-sdk/client-elasticache ioredis -w server --min-release-age=7
```

### Cấu trúc thư mục

```bash
web/src/services/elasticache/
├── index.tsx                  # elasticacheService để thêm vào registry
├── routes.ts                  # ELASTICACHE_ROUTE_PATTERNS, elasticacheRoutes, CLUSTER_TABS, breadcrumb
├── constants.ts               # engine, node type, giới hạn tên, kiểu key, độ rộng panel
├── schemas.ts                 # zod: tạo cluster, tạo key, TTL, form phần tử (theo kiểu)
├── keyText.ts                 # chữ hiển thị: kiểu key, ô TTL, dòng mô tả của panel
├── hooks/
│   ├── useElastiCache.ts      # ElastiCacheClient qua /aws (giống useDynamoDB.ts)
│   ├── useClusters.ts         # list (gộp 2 nguồn), create, delete
│   └── useRedis.ts            # gọi backend: trang key, giá trị key, server info, các thao tác ghi
├── pages/                     # ClusterList, CreateCluster, ClusterDetail
└── components/
    ├── KeysTab.tsx            # danh sách key, ô lọc, panel, modal xóa/flush
    ├── KeyValueBody.tsx       # thân panel theo kiểu; editor string
    ├── CollectionTable.tsx    # một bảng cho hash/list/set/sorted set, cấu hình theo kiểu
    ├── ElementModal.tsx       # thêm/sửa một phần tử, trường hiện theo kiểu
    ├── ValueEditor.tsx        # CodeEditor nạp lười, chọn JSON/chữ theo giá trị
    ├── CreateKeyModal.tsx, TtlModal.tsx, DeleteClustersModal.tsx
    ├── DetailsTab.tsx         # Connect, Server, General, Nodes
    └── ClusterStatus.tsx      # trạng thái, chỉ hiện khi khác available

web/src/shared/
├── Layout.tsx                 # truyền splitPanel vào AppLayout
├── hooks/useSplitPanel.ts     # store cho panel (theo createStore, giống breadcrumb)
├── components/Figure.tsx      # chuyển từ dynamodb/components: cột số dùng chung
├── components/CodeEditor.tsx  # thêm chế độ "text"
├── format.ts                  # thêm formatDuration: 59m 12s, 6h 0m
└── constants.ts               # thêm DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX (chuyển từ dynamodb), cỡ panel

server/src/
├── app.ts                     # tạo ElastiCacheClient, gắn /api/redis và error handler
├── middleware/error.ts        # HttpError, lỗi thành JSON { code, message }
└── routes/redis/
    ├── contract.ts            # type và mã lỗi dùng chung với web
    ├── router.ts              # route + zod
    └── client.ts              # tra endpoint, giữ kết nối, chạy lệnh
```

- **Mỗi thao tác là một hook** dùng TanStack Query, query key để chung file với hook. Danh sách key và giá trị key dùng `useInfiniteQuery` theo cursor. Mọi thao tác ghi làm mới cả nhóm query Redis của cluster.
- Gọi backend bằng `fetchJson` (`shared/api.ts`).
- **Panel:** `AppLayout` nằm trong `Layout.tsx`, còn trang render qua `Outlet`. Vì vậy trang Keys đặt nội dung panel vào một store dùng chung (cùng cách breadcrumb và Flashbar đang làm), rồi `Layout` đọc store và truyền vào `splitPanel`. Rời trang thì xóa panel. Service khác muốn dùng panel sau này thì dùng lại hook này.
- Form dùng zod + react-hook-form (`useZodForm`, `FormModal`, `FormFields`).
- Thêm vào `registry.ts` kèm số cluster ở trang Home. Thêm icon `web/public/icons/elasticache.svg` (SVG ở mục 3.10).
- **Chuyển sang `shared` những gì ElastiCache dùng lại của DynamoDB:** `Figure`/`FigureHeader`, `DETAIL_SEPARATOR` (Lambda đang khai báo trùng trong `useTriggers.ts`, gộp luôn), `ITEM_LIST_WIDTH_PX`. DynamoDB và Lambda đổi import theo. Không đổi hành vi.

### Dùng lại từ phần đã có

| Có sẵn                                        | Dùng ở đâu                             |
| --------------------------------------------- | -------------------------------------- |
| `ActionBar`, `refreshAction`                  | Nút trên mọi bảng                      |
| `FormModal`, `useZodForm`, `FormFields`       | Mọi modal có form                      |
| `ConfirmModal`                                | Xóa cluster, key, phần tử; flush       |
| `CodeEditor`                                  | Giá trị string, sửa value              |
| `useNotify`                                   | Báo thành công/lỗi                     |
| `CopyButton`                                  | Endpoint, connection string, ARN       |
| `EmptyState`, `emptyOrError`, `NotFound`      | Trạng thái bảng và trang               |
| `useIsCompact`                                | Dạng điện thoại                        |
| `Figure`, `FigureHeader` (chuyển sang shared) | Cột TTL, Nodes, Score; số trong Server |
| `KeyValuePairs`, `Container`                  | Tab Details                            |
| `formatDate`                                  | Ngày tạo                               |

---

## 7. Rủi ro cần kiểm tra trước

Đã chạy thử trên Floci 2.4.0 qua proxy `/aws` của console ngày 2026-11-09, với cluster tạm `lc-risk-test` (đã xóa sau khi thử).

| #   | Rủi ro                                                        | Kết quả                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **ElastiCache API qua proxy `/aws`** (protocol Query/XML)     | **Đã kiểm tra: ổn.** `CreateReplicationGroup`, `Describe…`, `Delete…` chạy qua proxy                                                                                                                                                                                                                                     |
| 2   | **Endpoint Floci trả về**                                     | **Đã kiểm tra:** `localhost:6379` (Primary, Reader và node đều vậy)                                                                                                                                                                                                                                                      |
| 3   | **Backend console kết nối Redis**                             | **Đã kiểm tra:** từ container console, `floci:6379` trả `PONG`; `localhost` và `host.docker.internal` bị từ chối. Proxy TCP chạy trong container Floci → đổi `localhost` thành host của `AWS_ENDPOINT_URL`. Proxy chỉ nhận lệnh dạng RESP (ioredis gửi đúng dạng này), lệnh dạng chữ thường (`PING\r\n`) bị đóng kết nối |
| 4   | **BE chạy ngoài Docker kết nối Redis**                        | **Đã kiểm tra:** `localhost:6379` từ máy dev không kết nối được → compose đã mở `6379-6399` (mục 8)                                                                                                                                                                                                                      |
| 5   | **Thời gian tạo**                                             | **Đã kiểm tra:** `CreateReplicationGroup` trả `available` ngay (Floci chờ container sẵn sàng rồi mới trả). Vẫn giữ tự tải lại khi `creating` cho cluster tạo bằng cách khác                                                                                                                                              |
| 6   | **Floci khởi động lại**                                       | **Chưa kiểm tra** (phải restart Floci đang chạy). Theo tài liệu: dữ liệu mất, cluster được tạo lại                                                                                                                                                                                                                       |
| 7   | **`DescribeCacheClusters` trả cả node của replication group** | **Đã kiểm tra: có.** Node `lc-risk-test-001` có `ReplicationGroupId` → lọc bỏ                                                                                                                                                                                                                                            |
| 8   | **Xóa cluster**                                               | **Đã kiểm tra:** trả `deleting`, vài giây sau biến mất, container Valkey bị xóa. Cluster không tồn tại: `ReplicationGroupNotFoundFault`                                                                                                                                                                                  |

---

## 8. Thay đổi ở spec chính và compose

| Chỗ                                   | Sửa                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Spec chính, mục 3 "Cài và chạy"       | **Đã làm:** "Tắt rồi bật lại vẫn còn", **trừ dữ liệu trong ElastiCache**       |
| Spec chính, mục 4 ElastiCache         | **Đã làm:** thêm link chi tiết, sửa bảng theo phạm vi đã làm                   |
| Spec chính, mục 5                     | **Đã làm:** bảng API Redis, cấu trúc thư mục server, compose mẫu               |
| Spec chính, mục 10 #3                 | **Đã làm:** ghi kết quả kiểm tra #3 ở mục 7                                    |
| `docker-compose.yml`, service `floci` | **Đã làm:** thêm cổng `"6379-6399:6379-6399"` (Redis cho BE chạy ngoài Docker) |

---

## 9. Thứ tự làm

1. Kiểm tra rủi ro (mục 7). Sửa compose.
2. User cài package (mục 6). Thêm `useElastiCache.ts`, icon, khai báo trong `registry.ts`.
3. Danh sách cluster, tạo, xóa, tab Details (chưa có khối Server).
4. Backend: `middleware/error.ts`, `routes/redis` (tra endpoint, kết nối, `keys`, `info`).
5. Tab Keys: lọc, Load more, tạo key, xóa nhiều, flush. Khối Server.
6. Panel giá trị: store panel trong `Layout`, rồi string → hash → list → set → sorted set. TTL.
7. Số cluster ở trang Home. Sửa spec chính (mục 8).

**Kiểm tra mỗi bước:** chạy trên Floci thật và chụp màn hình ở 3 độ rộng (theo yêu cầu hiện tại thì chưa viết test). Cuối cùng thử trọn luồng: tạo cluster → BE (hoặc `redis-cli` trên máy) ghi key vào `localhost:6379` → thấy key trong console → sửa, đặt TTL, xóa → BE đọc lại thấy thay đổi.

**Đã thử trên Floci 2.4.0 (2026-11-09):**

- **API (curl):** tạo key đủ 5 kiểu; trùng key, trùng field, trùng member (409); thêm/sửa/xóa field; push đầu và cuối, xóa theo index; thêm member, sửa score; sửa string giữ TTL; đặt và bỏ TTL; key không còn (404); sai kiểu (`WRONGTYPE` → 409); cursor sai (400); cluster không có (404); string binary trả `value: null`; key kiểu stream trả `unsupported`; server info.
- **Giao diện:** chụp ở 1288, 1000 và 390px qua Chrome DevTools Protocol: danh sách cluster, tab Keys, panel của string và 4 kiểu collection, key đã bị xóa, tab Details. Không màn nào cuộn ngang.
- **Chưa thử:** bấm thật trong giao diện các modal Create key, Edit, Set TTL, Delete, Flush. Rủi ro #6 (Floci khởi động lại).

**Lỗi tìm thấy khi thử và đã sửa:** tên key bị bóp vỡ chữ khi panel hẹp (đưa nút xuống thân panel); dòng thứ hai của bảng hai tầng dính vào dòng đầu; `KeyValuePairs` 2 cột trên điện thoại làm connection string bị bẻ giữa chữ (khung hẹp thì một cột).

---

## 10. Quyết định

| Quyết định                                                       | Lý do                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Phạm vi theo mục ElastiCache của spec chính                      | User chốt                                                            |
| Cluster qua AWS SDK trên trình duyệt; dữ liệu qua backend        | Giống các service khác; Redis không gọi được từ trình duyệt          |
| Tạo bằng `CreateReplicationGroup`, tắt cluster mode, 1 node      | Giống AWS Console; đủ cho dev local                                  |
| Xem key chỉ cho cluster thường, không AUTH/TLS, DB 0             | Dự án chỉ dùng cho dev local; cache tạo từ console luôn là loại này  |
| Tên key ở query, sửa từng field/phần tử                          | Key có ký tự đặc biệt; không ghi đè cả key lớn                       |
| Giá trị xem ở `SplitPanel` cạnh danh sách key, key lưu trên URL  | User chốt. Xem nhiều key liên tục không phải qua lại giữa hai trang  |
| Sửa string giữ TTL (`KEEPTTL`)                                   | Sửa giá trị không được làm mất hạn mà BE đã đặt                      |
| String binary hoặc > 1 MB chỉ xem kích thước                     | Tránh làm hỏng dữ liệu khi lưu                                       |
| Mỗi request hỏi lại endpoint, giữ kết nối Redis                  | Đúng khi cluster bị tạo lại; Redis không phải mở kết nối mới mỗi lần |
| Nút của panel nằm trong thân, không ở header                     | Panel bên phải có thể chỉ rộng khoảng 240px; tên key cần đủ chỗ      |
| Type của API ở `contract.ts`, web import qua alias `@server`     | Một nguồn cho server và web, đúng ý "dùng chung type" của spec chính |
| Một `CollectionTable` cấu hình theo kiểu, không làm 4 bảng riêng | Bốn kiểu chỉ khác cột và thao tác                                    |

### Câu hỏi đã chốt

| #   | Câu hỏi                                                                   | Chốt                                                                          |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Có cần hỗ trợ cluster mode, AUTH, Serverless ngay đợt này không?          | Không. Dự án chỉ dùng cho dev local, cache tạo từ console. Để ở mục "Làm sau" |
| 2   | Xem giá trị ở trang riêng hay ở panel bên phải trang Keys (`SplitPanel`)? | Panel bên phải (`SplitPanel`). Khung hẹp thì panel xuống dưới                 |
