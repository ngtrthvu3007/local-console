# Báo cáo test — ngtrthvu3007/local-console

- Ngày: 2026-11-16 · Bản: `main` trên GitHub (build thẳng từ git URL, không clone)
- Môi trường: Floci 2.4.0 + console (cấu hình giống `docker-compose.yml` của repo, chỉ mở cổng ở 127.0.0.1) · Chromium (Playwright 1.63)
- Region khi chạy: `us-east-1` (lấy từ `AWS_REGION` của shell lúc `docker compose up`, không phải mặc định `ap-southeast-1`)

## 1. Kết quả

| Loại | Kết quả | Phạm vi |
| --- | --- | --- |
| UT (vitest) | ✅ 112/112 | 9 module logic thuần của web: `itemJson`, `expressions`, `searchSummary`, S3 `helpers` / `notificationRules` / `lifecycleRules`, `keyText`, `format`, `json` |
| IT (vitest, gọi thật) | ✅ 29/29 | `/api/*`, proxy `/aws`, S3, DynamoDB, Redis (`/api/redis`), RabbitMQ (`/api/mq`), dây chuyền S3 / SQS / DynamoDB stream → Lambda |
| E2E (Playwright) | ✅ 13/13 | S3 tạo → upload → preview → xoá · DynamoDB tạo bảng → tạo item → xoá · Lambda tạo → Test → xoá · điều hướng. 1 test đánh dấu bug B1 |
| UI / responsive (4 khung) | ⚠️ 20/40 | 1440 / 1024 / 768 / 390px: không tràn ngang, đúng 1 h1, có `lang`, menu gập trên phone ✅ · 20 fail đều do bug B2 |
| UX component | 21 trạng thái × 2 khung | Ảnh ở [results/ux/](results/ux/), ảnh từng trang theo khung ở [results/screens/](results/screens/) |

- Kiểm tra độ nhạy của UT: cố ý làm hỏng 3 chỗ trong source → test bắt được cả 3.
- Sau mỗi lần chạy không sót resource (`node it/leftovers.mjs`).

## 2. Bug

### B1 — URL không có route: trang lỗi trắng, mất cả layout · Mức: Cao

- Tái hiện: mở `/s3/does-not-exist/at-all` (hoặc bất kỳ path lạ nào).
- Thấy: trang mặc định của React Router "Unexpected Application Error! 404 Not Found", không header, không menu, không nút quay lại.
- Nguyên nhân: `web/src/router.tsx` không có route `"*"` và không có `errorElement`. Component `shared/components/NotFound.tsx` đã có sẵn nhưng chỉ dùng cho resource không tồn tại.
- Đề xuất: thêm route `"*"` trong `Layout` để giữ header/menu, dùng lại `NotFound`:

```tsx
// web/src/router.tsx
import { NotFound } from "@shared/components/NotFound.tsx";

// Path không khớp route nào: vẫn trong Layout để còn menu và nút quay lại
const NOT_FOUND_PATH = "*";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: HOME_PATH, element: <Home /> },
      ...services.map((service) => ({ path: servicePath(service), children: service.routes })),
      {
        path: NOT_FOUND_PATH,
        element: (
          <NotFound
            title='Page not found'
            description="This page doesn't exist in Local Console."
            backHref={HOME_PATH}
            backText='Back to Console Home'
          />
        ),
      },
    ],
  },
]);
```

- Nên thêm `errorElement` cho route gốc để lỗi render (throw trong component) cũng không làm trắng trang.
- Sau khi sửa: bỏ dòng `test.fail()` trong `e2e/home.spec.ts`.

### B2 — Ô chọn trong bảng không có tên cho trình đọc màn hình · Mức: Trung bình (a11y)

- Thấy: checkbox "chọn tất cả" ở header và checkbox / radio từng dòng không có accessible name. Trình đọc màn hình chỉ đọc "checkbox".
- Phạm vi: cả 15 bảng có `selectionType`, không bảng nào truyền `ariaLabels`:
  - S3: `BucketList`, `ObjectsTab`, `ObjectVersions`, `UploadPage`, `MultipartUploadsSection`, `RulesSection`
  - DynamoDB: `TableList`, `ItemsTab`
  - Lambda: `FunctionList`, `TriggersTab`
  - ElastiCache: `ClusterList`, `KeysTab`, `CollectionTable`
  - MQ: `BrokerList`, `QueuesTab`
- Đề xuất: một helper dùng chung, mỗi bảng thêm một prop:

```ts
// web/src/shared/tableAriaLabels.ts
import type { TableProps } from "@cloudscape-design/components/table";
import { nounFor } from "./format.ts";

// Tên cho ô chọn của Table: "Select all tables", "Select orders"
export function selectionLabels<T>(noun: string, nameOf: (item: T) => string): TableProps.AriaLabels<T> {
  return {
    selectionGroupLabel: `${noun} selection`,
    allItemsSelectionLabel: () => `Select all ${nounFor(2, noun)}`,
    itemSelectionLabel: (_selection, item) => `Select ${nameOf(item)}`,
  };
}
```

```tsx
// ví dụ: web/src/services/dynamodb/pages/TableList.tsx
<Table
  selectionType='multi'
  ariaLabels={selectionLabels<TableDescription>("table", (table) => table.TableName ?? "")}
  ...
/>
```

### B3 — Compose mặc định mở cổng ra cả mạng LAN · Mức: Cao (bảo mật, từ review code)

- Thấy: `docker-compose.yml` publish `4566`, `3701`, `6379-6399` trên mọi interface; Floci lại mount `docker.sock`; console không có đăng nhập.
- Hệ quả: người cùng mạng tạo được Lambda qua `:4566` hoặc qua console, tức là chạy code trên Docker của máy.
- Đề xuất: bind `127.0.0.1` phía host, giữ `0.0.0.0` bên trong container:

```yaml
ports:
  - "127.0.0.1:4566:4566"
  - "127.0.0.1:6379-6399:6379-6399"
# console
  - "127.0.0.1:3701:3701"
```

## 3. UX — nên sửa (mức thấp)

| # | Vấn đề | Ảnh | Đề xuất |
| --- | --- | --- | --- |
| U1 | Upload trên phone: cột Status nằm khuất bên phải (bảng cuộn ngang), lúc upload chỉ thấy tên file | [phone-s3-upload-done](results/ux/phone-s3-upload-done.png) | Đổi thứ tự cột thành Name → Status → Size → Type trong `UploadPage.tsx`, hoặc dùng `columnDisplay` ẩn Type/Size khi compact như các bảng khác |
| U2 | Dòng dài (log trong kết quả Test của Lambda, "Connect your app" trên phone) cuộn trong khung nhưng không thấy là cuộn được (thanh cuộn overlay của macOS) | [desktop-lambda-test-result](results/ux/desktop-lambda-test-result.png), [ui-phone/home](results/screens/ui-phone/home.png) | Riêng log: cho xuống dòng (`white-space: pre-wrap`) — thêm prop `wrap` vào `CodeSnippet`; code env giữ cuộn |
| U3 | Modal Add trigger: ô Bucket trống, không có placeholder | [desktop-lambda-add-trigger-modal](results/ux/desktop-lambda-add-trigger-modal.png) | `FormSelect` chưa nhận `placeholder`: thêm prop và truyền xuống `<Select placeholder=… empty="No buckets">`, rồi dùng `placeholder='Choose a bucket'` |
| U4 | Lỗi validation và dòng gợi ý nói cùng một quy tắc, trên phone chiếm chỗ | [phone-s3-create-validation](results/ux/phone-s3-create-validation.png) | Trong `ControlledField` (`FormFields.tsx`): khi có `fieldState.error` thì không truyền `constraintText` |
| U5 | Phone: "2.0 KB", "0 functions" xuống dòng | [phone-s3-objects-table](results/ux/phone-s3-objects-table.png), [ui-phone/home](results/screens/ui-phone/home.png) | Không cần sửa; nếu muốn thì `nowrap` cho cột số |

## 4. Đã kiểm, không phải lỗi

- `CodeSnippet` cố ý cuộn ngang trong khung để trang không cuộn ngang (comment trong code nói rõ).
- Danh sách item 2 tầng trên phone chỉ hiện 3 thuộc tính (`COMPACT_PREVIEW_ATTRIBUTES = 3`), nên thuộc tính thứ 4 trở đi không hiện.
- RabbitMQ đặt tên rỗng `""` cho exchange mặc định; web đã đổi thành "(AMQP default)".
- Bucket `awslambda-us-east-1-tasks` là của Floci tạo khi chạy Lambda, không phải của test.

## 5. Điểm UX làm tốt (giữ nguyên)

- Form báo lỗi tại chỗ, chặn trước khi gọi API; gợi ý có ví dụ.
- Mọi thao tác đều có flash; modal xoá bắt gõ tên và đổi nút theo hành động ("Empty and delete").
- Editor tạo item điền sẵn key của bảng, báo lỗi đúng dòng / cột.
- Số lớn hiển thị nguyên vẹn; tab Test của Lambda có đủ thời gian, request ID, response, log, Copy.
- Phone: bảng item thành danh sách 2 tầng, form tìm kiếm thu thành "Edit search", nút gom vào split-button.

## 6. Chạy lại

Từ gốc repo:

```bash
npm test -w web                        # UT
docker compose up --build -d           # IT / E2E / UI cần console đang chạy
npm run test:it -w tests               # IT
npm run test:e2e -w tests              # E2E
npm run test:ui -w tests               # UI / responsive
npm run test:ux -w tests               # ảnh UX component
npm run leftovers -w tests             # resource test còn sót (-- --delete để xoá)
```

- Báo cáo HTML của Playwright: [results/report/index.html](results/report/index.html).
- Chạy lại `test:ui` / `test:ux` sẽ ghi đè ảnh trong `results/screens/`, `results/ux/`.
