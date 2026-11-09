# DynamoDB — Thiết kế

> Ngày: 2026-11-09 · Trạng thái: đã làm (2026-11-09) · Thuộc: [Local Console](2026-11-09-localconsole-design.md)

## 1. Mục tiêu

Làm màn hình DynamoDB giống AWS DynamoDB Console, **chỉ gồm phần dev local thật sự dùng**. Bảng thường được tạo bằng tool của dự án (SAM, Terraform, CDK…), nên console dùng để:

- Xem đang có bảng nào, key và index ra sao.
- **Xem dữ liệu trong bảng**: Scan, Query theo key hoặc index, lọc theo attribute.
- Sửa, thêm, xóa vài item để test; nạp dữ liệu mẫu từ file JSON, tải dữ liệu ra file.
- Bật TTL và Stream để **nối DynamoDB với Lambda**, rồi xem function chạy khi item thay đổi.
- Tạo nhanh một bảng để thử một luồng.

Mọi thao tác đều gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Các tính năng trong "Làm trong đợt này" đã được đối chiếu với [tài liệu DynamoDB của Floci](https://floci.io/floci/services/dynamodb/) **và chạy thử trên Floci 2.4.0** (xem mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (như S3 và Lambda): chỉ làm việc dev local mở console ra để làm. Cấu hình bảng thường nằm trong IaC của dự án, nên console ưu tiên **xem và sửa dữ liệu**.

### Làm trong đợt này

| Nhóm   | Tính năng                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bảng   | Liệt kê, tạo (partition key, sort key, GSI), xóa nhiều bảng; trang chi tiết (key, index, số item, ARN)                                                   |
| Item   | Scan hoặc Query trên bảng hoặc index; điều kiện sort key; lọc theo attribute; đảo thứ tự; phân trang                                                     |
| Sửa    | Tạo, sửa, nhân bản item bằng JSON editor (JSON thường hoặc DynamoDB JSON); xóa nhiều item                                                                |
| File   | Import item từ file JSON (ghi hàng loạt); Export cả bảng ra file JSON                                                                                    |
| TTL    | Bật/tắt, chọn attribute làm hạn                                                                                                                          |
| Stream | Bật/tắt, chọn loại dữ liệu; xem Stream ARN và các Lambda đang gắn vào stream; **thêm trigger Lambda ngay từ trang bảng**                                 |
| Lambda | Tab Triggers của Lambda thêm nguồn **DynamoDB** (chọn bảng có Stream). Sửa lỗi hiện có: mọi event source mapping đang bị ghi là SQS, giờ hiện đúng nguồn |

### Làm sau

| Tính năng                         | Ghi chú                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| PartiQL editor                    | Floci chạy được (đã thử `SELECT`, `UPDATE`). Màn Scan/Query đủ dùng |
| Thêm/xóa GSI sau khi tạo bảng     | Đổi index thì sửa IaC rồi deploy lại                                |
| Form sửa item theo từng attribute | JSON editor đủ cho dev. Form phải xử lý Map/List lồng nhau          |
| LSI khi tạo bảng                  | Hiếm dùng. Bảng có LSI (tạo bằng IaC) vẫn hiện LSI để xem           |
| Tag                               | Ít dùng khi dev local                                               |

### Không làm

| Tính năng                                         | Lý do                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Backup, point-in-time recovery                    | Chuyện production                                                   |
| Global Tables                                     | Chuyện nhiều region của production                                  |
| Export/Import qua S3 (`ExportTableToPointInTime`) | Import/Export bằng file JSON trên trình duyệt đã đủ và đơn giản hơn |
| Kinesis streaming, Contributor Insights           | Floci chỉ lưu cấu hình hoặc chạy tối thiểu. Không cần khi dev local |
| Vector index                                      | Tính năng mới, ít dùng                                              |
| Chọn billing mode, capacity                       | Local không giới hạn throughput. Bảng tạo từ console luôn on-demand |

### Các đề xuất đã xem xét

Quyết định đã chốt với user.

| #   | Tính năng                         | Floci                                                | Quyết định |
| --- | --------------------------------- | ---------------------------------------------------- | ---------- |
| 1   | TTL (bật/tắt)                     | Chạy. Xóa item hết hạn mỗi 60 giây                   | đợt này    |
| 2   | Stream + trigger Lambda           | Chạy. Đã thử: Lambda nhận `INSERT`, `REMOVE`         | đợt này    |
| 3   | Import/Export item bằng file JSON | Ghi hàng loạt bằng `BatchWriteItem`, đọc bằng `Scan` | đợt này    |
| 4   | PartiQL editor                    | Chạy (đã thử)                                        | làm sau    |
| 5   | Thêm/xóa GSI sau khi tạo          | `UpdateTable` có (theo tài liệu), GSI `ACTIVE` ngay  | làm sau    |
| 6   | Form sửa theo attribute           | Không phụ thuộc Floci                                | làm sau    |

---

## 3. Màn hình

### 3.1 Danh sách bảng — `/dynamodb/tables`

Xem bố cục cuối ở mục 3.10 (bỏ cột Status, key ghi dạng `pk String`).

- Bấm tên để mở trang chi tiết. Chọn nhiều bảng để xóa.
- Ô tìm lọc ngay trên trình duyệt. `ListTables` trả theo trang, console tải hết rồi gọi `DescribeTable` từng bảng (song song) để có key, index, số item.
- Số item lấy từ `ItemCount`. Floci cập nhật ngay (AWS cập nhật khoảng 6 giờ một lần).
- Khung hẹp: mỗi dòng hai tầng, tên + số item rồi key (mục 3.10).
- **Chưa có bảng nào:** "No tables" kèm nút Create table.

### 3.2 Tạo bảng — `/dynamodb/tables/create`

| Trường        | Ghi chú                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| Table name    | 3–255 ký tự: chữ, số, `_`, `-`, `.`                                                      |
| Partition key | Tên + kiểu (String / Number / Binary)                                                    |
| Sort key      | Tùy chọn. Tên + kiểu                                                                     |
| GSI           | Tùy chọn, thêm nhiều dòng: tên index, partition key, sort key tùy chọn. Projection = ALL |

- Bảng luôn tạo dạng on-demand (`PAY_PER_REQUEST`).
- Kiểm tra: tên key không rỗng; cùng một tên attribute thì phải cùng kiểu (DynamoDB bắt buộc); tên GSI không trùng.
- Stream và TTL bật sau ở tab Settings để form gọn.
- Tạo xong thì mở trang chi tiết, báo "Created table orders".

### 3.3 Chi tiết bảng — `/dynamodb/tables/:table`

```bash
orders                                                   [Copy ARN] [Delete]
[Items] [Settings]
```

- Tab lưu trên URL (`?tab=settings`). **Mặc định mở Items**, vì xem dữ liệu là việc chính.
- Bảng không tồn tại: "Table orders not found" kèm link về danh sách.

### 3.4 Tab Items

```bash
(•) Scan  ( ) Query          Table or index [orders (table) ▾]
Partition key  pk  [user#1        ]                       (chỉ khi Query)
Sort key       sk  [begins with ▾] [order#      ]          (chỉ khi Query)
Filters        [status] [= ▾] [String ▾] [DONE ]  [Remove]   [Add filter]
               [ ] Sort descending                         (chỉ khi Query)
                                                            [Reset] [Run]

Items returned (3) · scanned 50          [↻] [Import] [Export] [Actions ▾] [Create item]
 ☐ pk        sk           status   createdAt    meta
 ☐ user#1    order#001    DONE     1700000001   {"ok":true}
                                                            [Load more]
```

**Điều kiện tìm:**

| Trường          | Ghi chú                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Scan / Query    | Mặc định Scan                                                                                                |
| Table or index  | Bảng, các GSI và LSI. Đổi lựa chọn thì ô Partition key / Sort key đổi theo key của index                     |
| Partition key   | Bắt buộc khi Query. Nhập theo kiểu của key (Number thì chỉ nhận số)                                          |
| Sort key        | Tùy chọn: `=`, `<`, `<=`, `>`, `>=`, `begins with`, `between` (hai ô). `begins with` chỉ cho key kiểu String |
| Filters         | Nhiều dòng, nối bằng AND. Mỗi dòng: tên attribute, phép so sánh, kiểu, giá trị                               |
| Sort descending | Khi Query: `ScanIndexForward = false`                                                                        |

Phép so sánh của filter: `=`, `≠`, `<`, `<=`, `>`, `>=`, `begins with`, `contains`, `exists`, `not exists`, `between`. Kiểu giá trị: String, Number, Boolean. `exists`/`not exists` không có ô giá trị.

**Kết quả:**

- Mỗi trang gọi API một lần với `Limit = 50`. Còn `LastEvaluatedKey` thì có nút **Load more**.
- Có filter thì ghi "Items returned (3) · scanned 50": DynamoDB lọc **sau khi** đọc, nên một trang có thể ít item hoặc trống mà vẫn còn trang sau. Đã thử trên Floci: đúng như vậy.
- Cột: partition key, sort key đứng đầu, tiếp theo là mọi attribute khác của các item đang hiện, theo thứ tự xuất hiện. Khung hẹp thành danh sách hai tầng (mục 3.10).
- Giá trị trong ô: String, Number hiện nguyên văn (số giữ nguyên chuỗi gốc); Boolean `true`/`false`; Null `null`; Map, List, Set hiện JSON thu gọn, dài thì cắt và có `…`; Binary hiện `Binary (12 B)`.
- Bấm vào giá trị partition key để mở item trong modal sửa.
- Bấm Run khi đang có dữ liệu thì tải lại từ trang đầu. Đổi điều kiện mà chưa bấm Run thì kết quả giữ nguyên.

**Thao tác:**

| Nút         | Ghi chú                                                   |
| ----------- | --------------------------------------------------------- |
| Create item | Mở editor với khung item có sẵn các key của bảng          |
| Edit        | Chọn đúng 1 item (hoặc bấm vào partition key)             |
| Duplicate   | Mở editor với nội dung item đang chọn, lưu thành item mới |
| Delete      | Chọn nhiều item. Gõ `delete` để xác nhận                  |
| Import      | Modal chọn file JSON (mục 3.6)                            |
| Export      | Tải **cả bảng** ra `<table>.json` (mục 3.6)               |

Edit, Duplicate, Delete nằm trong dropdown Actions. Nút chính của tab là **Run** ở form tìm; Create item là nút thường (mục 3.10).

### 3.5 Editor item (modal)

```bash
Edit item                                              [ ] DynamoDB JSON
┌───────────────────────────────────────────────────────────────────────┐
│ {                                                                     │
│   "pk": "user#1",                                                     │
│   "sk": "order#001",                                                  │
│   "status": "DONE"                                                    │
│ }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
                                                        [Cancel] [Save]
```

- Hai dạng, chuyển bằng công tắc **DynamoDB JSON**:
  - **JSON thường** (mặc định): `{"status": "DONE", "count": 3}`.
  - **DynamoDB JSON**: `{"status": {"S": "DONE"}, "count": {"N": "3"}}`.
- **Item có dữ liệu mà JSON thường không biểu diễn chính xác được thì chỉ mở được dạng DynamoDB JSON**, công tắc bị khóa kèm ghi chú lý do:
  - số vượt độ chính xác của JavaScript (vd: `12345678901234567890.123`), vì đổi sang number là mất số;
  - Set (`SS`, `NS`, `BS`), vì JSON thường chỉ có mảng, lưu lại sẽ thành List;
  - Binary (`B`).
- Chuyển qua lại thì đổi nội dung editor theo; JSON đang sai cú pháp thì không cho chuyển.
- **Kiểm tra trước khi lưu:** JSON hợp lệ; là một object; có đủ key của bảng với đúng kiểu; DynamoDB JSON thì mỗi giá trị đúng dạng `{ "<kiểu>": … }`.
- **Không đổi được key khi sửa.** Key khác bản gốc thì báo "Key attributes can't be changed. Use Duplicate to copy the item with a new key."
- Lưu:
  - Create, Duplicate: `PutItem` với điều kiện item chưa tồn tại. Trùng key thì báo "An item with this key already exists."
  - Edit: `PutItem` thay cả item (giống AWS Console).
- Item lớn hơn 400 KB: Floci từ chối như AWS, lỗi hiện ở Flashbar của modal.

### 3.6 Import / Export

**Export:**

- Scan **cả bảng** (mọi trang), tải file `<table>.json`.
- Định dạng: mảng item dạng **DynamoDB JSON**, để không mất số lớn, Set, Binary.
- Nút giữ loading khi đang đọc; đọc xong báo "Exported 1,204 items".

**Import (modal):**

| Trường | Ghi chú                                                              |
| ------ | -------------------------------------------------------------------- |
| File   | Một file `.json`, tối đa 10 MB                                       |
| Format | DynamoDB JSON (mặc định, đúng định dạng của Export) hoặc JSON thường |

- File phải là **mảng item**. Mỗi item phải có đủ key của bảng.
- Kiểm tra cả file trước khi ghi; có item sai thì không ghi gì, báo item thứ mấy sai và vì sao.
- Ghi bằng `BatchWriteItem` 25 item một lần; item Floci chưa xử lý (`UnprocessedItems`) thì gửi lại.
- Item trùng key thì **ghi đè** (giống `PutItem`). Modal ghi rõ điều này.
- Xong: "Imported 120 items", tải lại kết quả ở tab Items.

### 3.7 Tab Settings

| Khối                | Nội dung                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| General information | Partition key, sort key, trạng thái, số item, ngày tạo, ARN (copy được)                                                  |
| Indexes             | Bảng: tên, loại (GSI / LSI), partition key, sort key, projection                                                         |
| Time to Live (TTL)  | Trạng thái, attribute. Nút **Edit**: bật (nhập tên attribute) hoặc tắt                                                   |
| Stream              | Trạng thái, loại dữ liệu, Stream ARN (copy được). Nút **Edit**: bật (chọn loại) hoặc tắt                                 |
| Lambda triggers     | Các function đang đọc stream này: tên (link sang tab Triggers của function), trạng thái, batch size. Nút **Add trigger** |

**TTL:**

- Ghi chú dưới khối: attribute hạn là **số giây Unix** (vd: `1767225600`). Floci xóa item hết hạn mỗi 60 giây; trước đó item vẫn đọc được.

**Stream:**

| Loại dữ liệu       | Ghi chú                      |
| ------------------ | ---------------------------- |
| New and old images | Mặc định. Đủ nhất cho Lambda |
| New image          |                              |
| Old image          |                              |
| Keys only          |                              |

- Đổi loại dữ liệu khi stream đang bật: console tắt rồi bật lại (DynamoDB không cho đổi trực tiếp). Modal báo stream ARN sẽ đổi và trigger Lambda đang gắn với ARN cũ cần tạo lại.
- Tắt stream khi còn Lambda trigger: modal cảnh báo các trigger đó sẽ ngừng nhận dữ liệu.
- Khối Lambda triggers chỉ hiện khi stream đang bật. Chưa có trigger: "No Lambda triggers" kèm nút Add trigger.
- **Add trigger (modal):** Function (dropdown các function), Starting position, Batch size, Enabled; cùng giới hạn và mặc định với modal của Lambda (mục 3.9). Stream ARN lấy từ bảng. Thêm xong, khối tự tải lại và thông báo có link sang tab Triggers của function.

### 3.8 Các modal xác nhận

| Thao tác              | Xác nhận                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Delete table(s)       | Gõ `delete`. Liệt kê bảng sẽ xóa. Bảng có Lambda trigger thì cảnh báo trigger sẽ ngừng chạy |
| Delete item(s)        | Gõ `delete`. Liệt kê key của vài item đầu                                                   |
| Import                | Báo item trùng key sẽ bị ghi đè                                                             |
| Tắt stream / đổi loại | Như mục 3.7                                                                                 |

### 3.9 Thay đổi ở Lambda (tab Triggers)

**Danh sách trigger:** nguồn của event source mapping lấy theo ARN, không mặc định là SQS nữa.

| ARN bắt đầu bằng    | Source   | Resource  | Details                   |
| ------------------- | -------- | --------- | ------------------------- |
| `arn:aws:sqs:`      | SQS      | tên queue | `Batch size 10`           |
| `arn:aws:dynamodb:` | DynamoDB | tên bảng  | `Batch size 100 · Latest` |

Enable / Disable / Delete dùng chung cho SQS và DynamoDB.

**Add trigger:** Source có thêm **DynamoDB**.

| Trường            | Ghi chú                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Table             | Dropdown các bảng. Bảng chưa bật stream thì bị khóa, ghi "Stream is off" kèm link sang tab Settings của bảng |
| Starting position | Latest (mặc định) hoặc Trim horizon (đọc từ bản ghi cũ nhất còn trong stream)                                |
| Batch size        | 1–10000, mặc định 100                                                                                        |
| Enabled           | Mặc định bật                                                                                                 |

Console tự lấy Stream ARN của bảng, user không phải nhập ARN. Phần gọi API và kiểm tra (batch size, starting position) dùng chung với nút Add trigger ở trang bảng (mục 3.7).

### 3.10 UI/UX chi tiết (desktop và điện thoại)

Dựng hoàn toàn bằng component và token của **Cloudscape**, giống S3 và Lambda: không thêm màu, font hay style riêng. Mục này quyết định bố cục, thứ tự đọc, trạng thái và màn hình điện thoại theo các nguyên tắc app screen của skill `taste-skill` (đã bỏ phần bốc style mới, vì console đã có design system).

**Câu hỏi của từng màn hình** (khối lớn nhất trả lời câu hỏi đó, và được đọc trước):

| Màn hình       | Câu hỏi chính                                    | Việc làm nhiều nhất, cách một cú bấm |
| -------------- | ------------------------------------------------ | ------------------------------------ |
| Danh sách bảng | Có những bảng nào, mỗi bảng chứa bao nhiêu?      | Mở một bảng                          |
| Tab Items      | Item mình cần nằm ở đâu, nội dung ra sao?        | Chạy Scan/Query, mở item để sửa      |
| Editor item    | Item này đã đúng chưa?                           | Save                                 |
| Tab Settings   | Bảng cấu hình ra sao, stream đã nối Lambda chưa? | Bật stream, Add trigger              |

#### Quy tắc chung

- **Một nút chính mỗi vùng.** Danh sách: Create table. Tab Items: **Run** là nút chính của form tìm; Create item là nút thường ở header kết quả (giống AWS Console). Modal: Save.
- **Số căn phải, chữ số đều nhau** (`font-variant-numeric: tabular-nums`): cột Items, Indexes ở danh sách; trong bảng item, cột nào mọi giá trị đều là Number thì căn phải.
- **Thiếu giá trị là "—" màu xám** (`text-status-inactive`); số 0 vẫn in "0". Ô có Map/List/Set màu xám nhạt hơn giá trị thường, để key và giá trị chính nổi lên.
- **Màu chỉ cho trạng thái cần chú ý:** không tô xanh "Active" ở mọi dòng. Trạng thái chỉ hiện khi bảng **không** Active (Creating, Deleting…), bằng `StatusIndicator` cạnh tên.
- **Key đọc như câu:** key hiện là `pk` (chữ đậm) + ` String` (xám), không dùng `pk (S)` khó đọc.
- **Câu tóm tắt điều kiện tìm** (điểm riêng của màn này): ngay trên bảng kết quả, điều kiện đang chạy được đọc lại thành một câu, vd: _Query on status-index · status = DONE · 2 filters — 3 returned, 50 scanned_. Người xem biết ngay kết quả đến từ đâu, và trên điện thoại câu này thay cho cả form khi form đang thu gọn.
- **Khối rỗng vẫn giữ khung và header**, thêm một câu và nút làm tiếp; khối lỗi báo lỗi ngay trong khối kèm Retry, không chiếm cả trang.

#### Danh sách bảng

Desktop (1440):

```text
Tables (3)                                            [↻] [Delete] [Create table]
Tables hold your items. Region: ap-southeast-1.
[🔍 Find tables by name                     ]
 ☐ Name ▲                Partition key     Sort key       Indexes      Items
 ☐ orders                pk String         sk String            2      1,204
 ☐ sessions              id String         —                    0         37
 ☐ users  ◔ Creating     userId String     —                    1          0
```

- Bỏ cột Status (đổi so với 3.1): trạng thái chỉ hiện cạnh tên khi khác Active.
- Cột Name rộng nhất (khoảng 1/3 bảng), không bao giờ bị cắt khi cột khác còn chỗ.

Điện thoại (390):

```text
≡  Local Console                    ◎
Tables (3)
[↻] [Create table ▾]
[🔍 Find tables by name ]
 ☐ orders                      1,204
   pk String · sk String · 2 indexes
 ☐ sessions                       37
   id String
```

- Mỗi dòng hai tầng: tên + số item ở tầng 1, key và số index (xám, 13px) ở tầng 2. Không bỏ thông tin, chỉ chuyển xuống dòng 2.
- Delete vào dropdown của nút chính (đúng cách `ActionBar` đang làm khi khung hẹp).

#### Chi tiết bảng: header

```text
orders                                                       [Copy ARN] [Delete]
pk String · sk String · 1,204 items · Stream on
[Items] [Settings]
```

- Dòng mô tả dưới tên thay cho khối "overview" riêng: tab Items mở ra là thấy ngay bảng kết quả, không phải cuộn qua một khối thông tin.

#### Tab Items

Desktop (1440). Màn hình đầu (900px cao) phải thấy: header, form tìm, câu tóm tắt và ít nhất 6 dòng kết quả.

```text
┌ Scan or query items ─────────────────────────────────────────────────────┐
│ [ Scan | Query ]     Table or index [orders (table)          ▾]           │
│ pk  String  [user#1                ]                                      │
│ sk  String  [begins with ▾] [order#              ]                        │
│ ▸ Filters (1)                                          [Reset] [  Run  ]  │
└──────────────────────────────────────────────────────────────────────────┘
Items (50+)                       [↻] [Import] [Export] [Actions ▾] [Create item]
Query on orders · pk = user#1 · sk begins with order# · 1 filter — 12 returned, 50 scanned
 ☐ pk ▸        sk           status    createdAt     price          meta
 ☐ user#1      order#001    DONE      1700000001    12345678901…   {"ok":true}
 ☐ user#1      order#004    OPEN      1700000004    —              {"ok":false}
                                 [Load 50 more]
```

- Form tìm nằm trong một container gọn, cao khoảng 190px khi đóng Filters. Filters là `ExpandableSection` có đếm số filter; tự mở khi đang có filter.
- Ô key ghi sẵn tên và kiểu key của bảng/index đang chọn, nên không phải nhớ tên key.
- **Cột đầu (partition key) cố định khi cuộn ngang** (`stickyColumns: { first: 1 }`), header bảng cố định khi cuộn dọc (`stickyHeader`). Bảng nhiều attribute cuộn ngang **trong khung bảng**, cả trang không cuộn ngang.
- Bấm giá trị partition key (link) để mở editor; chọn checkbox để làm hàng loạt.
- Load more là một nút toàn chiều rộng dưới bảng, ghi rõ "Load 50 more".

Trạng thái:

| Trạng thái                                      | Hiển thị trong khung bảng                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bảng chưa có item nào (Scan không filter)       | "This table is empty." + nút **Create item** và **Import** (việc đầu tiên đặt đúng chỗ dữ liệu sẽ hiện) |
| Có filter, trang không khớp item nào, còn trang | "No items matched in the first 50 scanned." + Load more                                                 |
| Không khớp và đã hết bảng                       | "No items match these conditions." + nút Reset                                                          |
| Đang tải                                        | Khung bảng giữ nguyên, câu tóm tắt vẫn hiện, "Loading items"                                            |
| Lỗi                                             | Câu lỗi + Retry trong khung bảng; form tìm giữ nguyên để sửa điều kiện                                  |

Điện thoại (390): danh sách phải bắt đầu trong 60% chiều cao đầu tiên của màn hình.

```text
orders
pk String · sk String · 1,204 items
[Items] [Settings]
┌ Query on orders · pk = user#1 ───────┐
│ 12 returned, 50 scanned  [Edit search]│
└───────────────────────────────────────┘
Items (50+)        [↻] [Create item ▾]
 ☐ user#1 · order#001
   status DONE · createdAt 1700000001
 ☐ user#1 · order#004
   status OPEN · createdAt 1700000004
        [Load 50 more]
```

- **Form tìm thu gọn thành câu tóm tắt** + nút Edit search (mở form ngay tại chỗ, các ô xếp dọc toàn chiều rộng). Lần đầu mở tab, form thu gọn vì đã tự chạy Scan.
- Bảng thành **danh sách hai tầng**: tầng 1 là key (link mở editor), tầng 2 là 2–3 attribute đầu tiên dạng `tên giá trị` (xám, 13px). Muốn xem đủ attribute thì mở item.
- Import, Export, Edit, Duplicate, Delete gom vào dropdown của nút Create item.
- Nút và dòng cao tối thiểu 44px để bấm bằng ngón tay (kích thước mặc định của Cloudscape đã đạt khi khung hẹp).

#### Editor item (modal)

Desktop: modal `large`, editor cao 420px, kéo cao được.

```text
Edit item  ·  orders                                   DynamoDB JSON [○ ]
pk = user#1 · sk = order#001
┌───────────────────────────────────────────────────────────────────────┐
│ { "pk": "user#1", "sk": "order#001", "status": "DONE" }               │
└───────────────────────────────────────────────────────────────────────┘
⚠ Key attributes can't be changed. Use Duplicate to copy the item.     (chỉ khi lỗi)
                                                       [Cancel] [Save]
```

- Dòng dưới tiêu đề ghi key của item đang sửa, để biết đang sửa item nào sau khi cuộn editor.
- Item phải dùng DynamoDB JSON: công tắc bị khóa, ghi chú ngay cạnh: "Shown as DynamoDB JSON: this item has a String Set." (lý do cụ thể).
- Lỗi kiểm tra hiện ngay dưới editor (đỏ, một câu), không bằng Flashbar, để không che nội dung.

Điện thoại: modal chiếm gần trọn màn hình (Cloudscape tự làm); editor cao khoảng 55% màn hình để còn thấy nút Save mà không phải cuộn; công tắc xuống dòng dưới tiêu đề.

#### Import (modal)

```text
Import items into orders
File      [Choose file]  orders.json · 48 KB
Format    (•) DynamoDB JSON   ( ) JSON
ℹ Items with the same key are overwritten.
Item 3: missing partition key "pk".                                   (chỉ khi lỗi)
                                                     [Cancel] [Import]
```

- Sau khi chọn file, nút ghi rõ số item: **Import 120 items** (đọc trước để biết); trong lúc ghi, nút loading và ghi tiến độ "Importing 75 of 120…".

#### Tab Settings

Desktop:

```text
┌ General information ────────────────────────────────────────────────────┐
│ Partition key   Sort key     Items     Created               ARN         │
│ pk String       sk String    1,204     2026-11-09 15:02:11   arn:… [⧉]   │
└─────────────────────────────────────────────────────────────────────────┘
┌ Indexes (2) ────────────────────────────────────────────────────────────┐
│ Name            Type   Partition key     Sort key       Projection      │
│ status-index    GSI    status String     —              All attributes   │
└─────────────────────────────────────────────────────────────────────────┘
┌ Time to Live (TTL) ─────── [Edit] ┐ ┌ Stream ─────────────────── [Edit] ┐
│ On · attribute expiresAt          │ │ On · New and old images           │
│ Unix time in seconds. Floci       │ │ arn:aws:dynamodb:…/stream/… [⧉]   │
│ deletes expired items every 60 s. │ │                                    │
└───────────────────────────────────┘ └───────────────────────────────────┘
┌ Lambda triggers (1) ─────────────────────────────────── [Add trigger] ──┐
│ Function            State       Batch size     Starting position        │
│ process-order       ● Enabled          100     Latest                   │
└─────────────────────────────────────────────────────────────────────────┘
```

- TTL và Stream nằm cạnh nhau, cùng chiều cao (cả hai đều ngắn).
- Khối Lambda triggers chỉ hiện khi stream bật. **Câu cần chú ý đặt ngay đầu khối:** stream bật mà chưa có trigger thì ghi "No Lambda reads this stream yet." cạnh nút Add trigger.
- Stream tắt: khối Stream ghi "Off. Turn it on to trigger Lambda functions when items change." kèm nút Edit, để biết bật để làm gì.

Điện thoại: các khối xếp dọc theo đúng thứ tự trên; General information thành danh sách nhãn trái giá trị phải; bảng Indexes và Lambda triggers thành danh sách hai tầng (tên + loại ở tầng 1, key ở tầng 2); ARN xuống dòng trong ô, nút copy giữ cạnh.

#### Tạo bảng

Desktop: form một cột rộng tối đa khoảng 800px (như Create function). Partition key và Sort key mỗi khối là một hàng [tên][kiểu]. GSI dùng `AttributeEditor`: mỗi index một hàng [tên index][partition key][kiểu][sort key][kiểu][Remove].

Điện thoại: hàng [tên][kiểu] vẫn nằm cùng dòng (kiểu là Select hẹp); mỗi GSI trong `AttributeEditor` tự xếp các ô thành cột (Cloudscape làm sẵn khi khung hẹp); Cancel / Create table ở cuối.

#### Lambda: Add trigger (DynamoDB)

- Dropdown Table: bảng chưa bật stream bị khóa và ghi "Stream is off" ngay trong lựa chọn; dưới ô có link "Turn on a table's stream in its Settings".
- Trên điện thoại giữ một cột như modal hiện tại.

#### Kiểm tra UI mỗi bước

Ở 1440, 1024 và 390: không trang nào cuộn ngang; bảng rộng cuộn trong khung của nó với cột đầu cố định; ở 1440×900, tab Items thấy header, form, câu tóm tắt và ít nhất 6 dòng; ở 390, dòng đầu của danh sách item nằm trong 60% chiều cao đầu màn hình; mọi nút cao ≥ 44px trên điện thoại.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                | Cách làm                                                                                                                                            | Ghi chú                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Danh sách bảng          | `ListTables` (mọi trang) → `DescribeTable` từng bảng song song                                                                                      | Local ít bảng nên nhanh                                                                     |
| Tạo bảng                | `CreateTable` với `AttributeDefinitions` gộp từ key của bảng và GSI (bỏ trùng)                                                                      | Floci trả `ACTIVE` ngay                                                                     |
| Scan / Query            | `Scan` / `Query` với `Limit`, `ExclusiveStartKey`, `KeyConditionExpression`, `FilterExpression`                                                     | Tên và giá trị luôn qua `#name` / `:value` để không vướng từ khóa dành riêng (vd: `status`) |
| Chuyển dạng JSON        | `marshall` / `unmarshall` của `@aws-sdk/util-dynamodb`, số dùng `wrapNumbers` để giữ chuỗi gốc                                                      | Kiểm tra số, Set, Binary trước khi cho mở dạng JSON thường                                  |
| Lưu item                | `PutItem`; tạo mới thêm `ConditionExpression: attribute_not_exists(<partition key>)`                                                                | `ConditionalCheckFailedException` → "An item with this key already exists"                  |
| Xóa nhiều item          | `BatchWriteItem` (`DeleteRequest`), 25 item một lần, gửi lại `UnprocessedItems`                                                                     | Báo số thành công và số lỗi                                                                 |
| Export                  | `Scan` mọi trang → `Blob` → tải file                                                                                                                | DynamoDB JSON                                                                               |
| Import                  | Đọc file → kiểm tra hết → `BatchWriteItem` (`PutRequest`) 25 item một lần                                                                           |                                                                                             |
| TTL                     | `DescribeTimeToLive`, `UpdateTimeToLive`                                                                                                            |                                                                                             |
| Stream                  | `DescribeTable` (`StreamSpecification`, `LatestStreamArn`); bật/tắt bằng `UpdateTable` với `StreamSpecification`                                    | Đổi loại = tắt rồi bật                                                                      |
| Lambda trigger của bảng | `ListEventSourceMappings` với `EventSourceArn` = Stream ARN                                                                                         | Dùng `useLambda` của Lambda                                                                 |
| Trigger DynamoDB        | `CreateEventSourceMapping` với Stream ARN, `StartingPosition`, `BatchSize`, `Enabled`. Một hàm dùng chung cho tab Triggers của Lambda và trang bảng | Đã thử: chạy                                                                                |
| Xóa bảng                | `DeleteTable` từng bảng                                                                                                                             | Event source mapping của stream cũ không tự mất: cảnh báo trong modal                       |

---

## 5. Trạng thái và lỗi

| Tình huống                                    | Hiển thị                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| Đang tải                                      | Bảng giữ khung và hiện "Loading…"                          |
| Không có bảng / item                          | Một câu trong khung bảng, kèm nút hành động chính nếu có   |
| Scan/Query có filter, trang không có item nào | "No items in this page" kèm Load more nếu còn trang        |
| Lỗi từ DynamoDB (vd: `ValidationException`)   | Flashbar với mã lỗi và message gốc                         |
| Lỗi khi lưu item                              | Flashbar, modal giữ nguyên nội dung để sửa tiếp            |
| Bảng không tồn tại                            | Trang "Table orders not found" kèm link về danh sách       |
| Xóa/Import lỗi một phần                       | Báo số thành công và số lỗi, liệt kê vài mục lỗi kèm lý do |
| Floci tắt                                     | Banner chung của app, bảng hiện lỗi kèm Retry              |

Sau mỗi thao tác thành công: Flashbar "success" ngắn, rồi tự tải lại dữ liệu liên quan (nút giữ loading tới khi dữ liệu mới về).

---

## 6. Kỹ thuật

### Package cần cài

| Package                    | Để làm gì                          |
| -------------------------- | ---------------------------------- |
| `@aws-sdk/client-dynamodb` | Gọi DynamoDB                       |
| `@aws-sdk/util-dynamodb`   | Chuyển JSON thường ↔ DynamoDB JSON |

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb -w web --min-release-age=7
```

Editor dùng lại `CodeEditor` (mode `json`).

### Cấu trúc thư mục

```bash
web/src/services/dynamodb/
├── index.tsx                  # dynamodbService để thêm vào registry
├── routes.ts                  # DYNAMODB_ROUTE_PATTERNS, dynamodbRoutes, TABLE_TABS, breadcrumb
├── constants.ts               # giới hạn tên, kiểu key, phép so sánh, page size, batch size, loại stream
├── schemas.ts                 # zod: tạo bảng, điều kiện tìm, TTL, stream, import
├── itemJson.ts                # JSON thường ↔ DynamoDB JSON, kiểm tra số/Set/Binary, hiển thị giá trị trong ô
├── expressions.ts             # dựng KeyConditionExpression / FilterExpression từ điều kiện tìm
├── hooks/
│   ├── useDynamoDB.ts         # DynamoDBClient qua /aws (giống useLambda.ts)
│   ├── useTables.ts           # list, describe, create, delete
│   ├── useItems.ts            # scan/query theo trang, put, delete nhiều, import, export
│   └── useTableSettings.ts    # TTL, stream, Lambda trigger của stream
├── pages/                     # TableList, CreateTable, TableDetail
└── components/                # ItemsTab, SearchForm, ItemEditorModal, ImportModal, SettingsTab, các modal
```

Thay đổi ở Lambda: `useTriggers.ts` (nguồn theo ARN, thêm trigger DynamoDB), `AddTriggerModal.tsx`, `constants.ts`, `schemas.ts`.

- **Mỗi thao tác là một hook** dùng TanStack Query, query key để chung file với hook (vd: `tableQueryKey(table, part)`).
- Form dùng zod + react-hook-form (`useZodForm`, `FormModal`, `FormFields`).
- Thêm DynamoDB vào `registry.ts` thì tự có ở menu trái và trang Home (kèm số bảng). Thêm icon `web/public/icons/dynamodb.svg`.
- **Server không đổi.**

### Dùng lại từ phần đã có

| Có sẵn                                             | Dùng ở đâu                                  |
| -------------------------------------------------- | ------------------------------------------- |
| `ActionBar`, `refreshAction`                       | Nút trên mọi bảng                           |
| `FormModal`, `useZodForm`, `FormFields`            | Mọi modal có form                           |
| `ConfirmModal` (`CONFIRM_DELETE`)                  | Xóa bảng, xóa item                          |
| `CodeEditor`                                       | Editor item                                 |
| `useNotify` (`notifyOutcome`, `notifyBulkOutcome`) | Báo thành công/lỗi                          |
| `CopyButton`                                       | ARN, Stream ARN                             |
| `EmptyState`, `emptyOrError`, `NotFound`           | Trạng thái bảng và trang                    |
| `formatDate`, `isNotFoundError`, `jsonError`       | Ngày tạo, bảng không tồn tại, kiểm tra JSON |
| Lambda: `useLambda`, `lambdaRoutes`                | Khối Lambda triggers ở tab Settings         |

---

## 7. Rủi ro cần kiểm tra trước

Đã chạy thử trên Floci 2.4.0 qua proxy `/aws` của console ngày 2026-11-09, với bảng và function tạm (đã xóa sạch sau khi thử).

| #   | Rủi ro                                                             | Kết quả                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **DynamoDB qua proxy**                                             | **Đã kiểm tra: ổn** (spec chính, và lần thử này)                                                                                                                                                                                                                               |
| 2   | **Tạo bảng có GSI, LSI, Stream**                                   | **Đã kiểm tra: ổn.** Bảng `ACTIVE` ngay                                                                                                                                                                                                                                        |
| 3   | **Số item**                                                        | **Đã kiểm tra:** `ItemCount` của bảng cập nhật ngay; của GSI luôn 0 (Floci không lưu index riêng) → chỉ hiện số item của bảng                                                                                                                                                  |
| 4   | **Query bảng, GSI, LSI**, `begins_with`, sắp xếp ngược, phân trang | **Đã kiểm tra: ổn.** LSI `KEYS_ONLY` trả đúng các key                                                                                                                                                                                                                          |
| 5   | **Scan có filter + Limit**                                         | **Đã kiểm tra:** `Limit 5` + filter trả 1 item, `ScannedCount 5`, còn `LastEvaluatedKey` → UI ghi "returned · scanned"                                                                                                                                                         |
| 6   | **Số lớn, Binary, Set**                                            | **Đã kiểm tra:** `12345678901234567890.123`, `B`, `SS` giữ nguyên → editor phải giữ chuỗi gốc (mục 3.5)                                                                                                                                                                        |
| 7   | **Điều kiện khi ghi, item > 400 KB**                               | **Đã kiểm tra:** `ConditionalCheckFailedException`, `ValidationException` đúng như AWS                                                                                                                                                                                         |
| 8   | **TTL**                                                            | **Đã kiểm tra:** bật được, `DescribeTimeToLive` trả `ENABLED`. Floci xóa item hết hạn mỗi 60 giây (theo tài liệu)                                                                                                                                                              |
| 9   | **Stream → Lambda**                                                | **Đã kiểm tra: ổn.** Event source mapping với Stream ARN, `StartingPosition LATEST`: function nhận `INSERT` và `REMOVE` sau vài giây                                                                                                                                           |
| 10  | **Tắt stream bằng `UpdateTable`, đổi loại dữ liệu**                | **Đã kiểm tra:** tắt rồi bật lại với loại mới chạy được; Stream ARN đổi và trigger gắn với ARN cũ không còn đọc stream mới → modal cảnh báo trước khi lưu                                                                                                                      |
| 11  | **`@aws-sdk/util-dynamodb` giữ số lớn**                            | **Đã kiểm tra:** `unmarshall` đổi số nguyên lớn thành BigInt (`JSON.stringify` không in được), số thập phân lớn thì báo lỗi; `wrapNumbers` trả object `{value}`. Vì vậy item có số lớn chỉ sửa bằng DynamoDB JSON (`needsDynamoJson`), và ô JSON thường từ chối số bị làm tròn |
| 12  | **PartiQL**                                                        | Đã thử `SELECT`, `UPDATE`: chạy. Để sau                                                                                                                                                                                                                                        |

---

## 8. Thứ tự làm

1. User cài package (mục 6). Thêm `useDynamoDB.ts`, icon, khai báo DynamoDB trong `registry.ts`.
2. `itemJson.ts`, `expressions.ts`: chuyển dạng JSON, dựng expression (phần logic khó nhất, làm trước).
3. Danh sách bảng, tạo bảng, xóa bảng.
4. Trang chi tiết, tab Items: Scan/Query, filter, phân trang, hiển thị giá trị.
5. Editor item: tạo, sửa, nhân bản, xóa nhiều.
6. Import, Export.
7. Tab Settings: thông tin chung, index, TTL, Stream, Lambda triggers.
8. Lambda: sửa nguồn trigger theo ARN, thêm trigger DynamoDB.
9. Số bảng ở trang Home.

**Kiểm tra mỗi bước:** chạy trên Floci thật và chụp màn hình ở 3 độ rộng (theo yêu cầu hiện tại thì chưa viết test). Cuối cùng thử trọn luồng: tạo bảng → bật stream → thêm trigger ở Lambda → import file JSON → thấy log ở tab Monitor của function; sửa một item có số lớn và Set, lưu lại, kiểm tra không đổi.

**Đã thử trên Floci 2.4.0 (2026-11-09):** danh sách, tạo, xóa bảng; Scan, Query (sort key, đảo thứ tự), GSI, filter với tên trùng từ khóa (`status`, `name`, `count`), Load more, trang lọc không khớp; bảng chỉ có partition key; tạo/sửa/nhân bản/xóa item, trùng key, đổi key bị chặn; item có số lớn + Set + Binary lưu lại không đổi; Export rồi Import lại, file lỗi ở item 3 không ghi gì, Import JSON thường; TTL xóa item hết hạn sau khoảng 45 giây; đổi loại stream; thêm trigger từ trang bảng và từ Lambda; trọn luồng tạo bảng → bật stream → trigger → Import → function nhận `INSERT`; ở 1440, 1024 và 390 không trang nào cuộn ngang.

**Quyết định lúc làm** (chi tiết hơn spec):

- Không có ô tick "Add sort key": để trống tên sort key nghĩa là không có sort key.
- Bảng item và form tìm chuyển sang dạng điện thoại khi vùng nội dung hẹp hơn 640px (`ITEM_LIST_WIDTH_PX`); tablet vẫn giữ dạng bảng.
- Editor item cao cố định 360px ở mọi độ rộng (kéo cao được), vừa thấy nút Save trên điện thoại.
- Dùng chung có thêm: `ActionBar` cờ `quiet`, `useIsCompact(maxWidth)`, `FormRadioGroup` `onChange`, `FormFileUpload`.

---

## 9. Quyết định

| Quyết định                                                      | Lý do                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Chỉ làm phần core + TTL, Stream, trigger Lambda, Import/Export  | User chốt. TTL và Stream cần để dùng với Lambda                      |
| Không làm PartiQL, thêm/xóa GSI, form theo attribute            | User chốt: dev local ít dùng                                         |
| Không có cột Status, không tô xanh "Active" mọi dòng (3.10)     | Màu chỉ cho trạng thái cần chú ý                                     |
| Form tìm thu gọn thành câu tóm tắt trên điện thoại (3.10)       | Danh sách item phải bắt đầu trong 60% đầu màn hình                   |
| Tab Items mở mặc định                                           | Xem dữ liệu là việc chính                                            |
| Tạo bảng không có LSI, không chọn capacity                      | LSI hiếm dùng; local không giới hạn throughput                       |
| Mỗi trang = một lần gọi API (`Limit 50`) + Load more            | Đúng cách DynamoDB phân trang; ghi rõ returned/scanned khi có filter |
| Item có số lớn, Set, Binary chỉ sửa bằng DynamoDB JSON          | JSON thường làm mất số hoặc đổi Set thành List khi lưu               |
| Không cho đổi key khi sửa item                                  | Đổi key là tạo item khác; dùng Duplicate                             |
| Export ra DynamoDB JSON                                         | Không mất dữ liệu; Import nhận lại đúng định dạng này                |
| Import kiểm tra cả file trước khi ghi                           | Tránh ghi dở một nửa file                                            |
| Tạo trigger DynamoDB ở cả tab Triggers của Lambda và trang bảng | User chốt. Chi phí nhỏ vì dùng chung phần gọi API và kiểm tra        |
| Bảng chưa bật stream thì khóa trong dropdown trigger            | Không tự bật stream ngầm; user bật ở tab Settings                    |

### Câu hỏi đã chốt

| #   | Câu hỏi                                                           | Chốt                                          |
| --- | ----------------------------------------------------------------- | --------------------------------------------- |
| 1   | Page size của tab Items cố định 50, hay cho chọn (25 / 50 / 100)? | Cố định 50                                    |
| 2   | Export cả bảng hay chỉ các item đang hiện trong kết quả tìm?      | Cả bảng (dùng để sao lưu, mang sang máy khác) |
| 3   | Tạo trigger Lambda ngay từ trang bảng?                            | Có. Dùng chung phần gọi API với Lambda        |
