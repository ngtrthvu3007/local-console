# Báo cáo test — ngtrthvu3007/local-console

## Kết quả mới nhất — 2026-11-27 (sau khi tách `core/`)

Working tree trên nhánh `dev` (chưa commit), sau plan [tách core](../docs/superpowers/plans/2026-11-27-core.md): logic gọi AWS của 25 service chuyển từ `web/` sang `core/` (operation + facade). Build lại Docker từ source local. Floci 2.4.0, region `ap-southeast-1`, Node 26.13.1, Playwright 1.65.0.

| Bộ kiểm tra                | Kết quả                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Typecheck / lint           | ✅ Pass (core, server, web)                                                           |
| Unit tests                 | ✅ **629/629**: core 562, server 12, web 55                                           |
| Integration với Floci thật | ✅ **35/35 file, 224 test** (≈3 phút); 4 test mới của API Gateway, mục 15             |
| E2E với Floci thật         | ✅ **283/283** (5,6 phút); 1 test mới của API Gateway                                 |
| UI responsive              | ✅ **268/268** (3,6 phút)                                                             |
| UX                         | ✅ **11/11** (1,2 phút)                                                               |
| Mobile (API fixtures)      | ✅ **36/36** (2,8 phút), sau khi sửa fixture, mục 14                                  |
| Bundle so với mốc đo       | ✅ Trong ngưỡng 5%, không SDK nào trong lần tải đầu (bảng ở mục 14)                   |
| Leftover sau khi dọn       | ✅ Không còn resource test; còn 73 tin SMS trong hộp thư giả (Floci không có API xóa) |

Chi tiết ở **mục 14** (test lại sau khi tách core) và **mục 15** (API Gateway: đối chiếu spec, test bổ sung).

## Kết quả 2026-11-17

Retest working tree trên nhánh `test/add-test-suites`, HEAD `9ee6433`; build lại Docker từ source local. Floci 2.4.0, region **`ap-southeast-1`**, Node 24.14.1, Chrome 154.0.8037.97, Playwright 1.65.0. Chạy khoảng 19:19–19:27, giờ Việt Nam.

| Bộ kiểm tra                        | Kết quả mới nhất                                               |
| ---------------------------------- | -------------------------------------------------------------- |
| Typecheck / build                  | ✅ Pass; build còn cảnh báo bundle lớn                         |
| Unit tests                         | ✅ **120/120**: server 8, web 112                              |
| Integration với Floci thật         | ✅ **29/29**                                                   |
| E2E với Floci thật                 | ✅ **13/13**, sau khi sửa assertion S3 đã lỗi thời             |
| UI responsive với Floci thật       | ✅ **40/40**, chạy lại sau sửa Refresh; xem mục 13             |
| UX component với Floci thật        | ✅ **3/3** scenario, 21 trạng thái × desktop/phone; xem mục 13 |
| Mobile regression với API fixtures | ✅ **27/27**, chạy theo 3 nhóm; xem mục 13                     |
| Performance trên Docker production | ❌ **6 FAIL, 2 WARN**; chi tiết mục 10                         |
| Cleanup / port binding thực tế     | ✅ Test resources đã dọn; cổng host bind `127.0.0.1`           |

Đợt kiểm tra UI/UX cuối và cleanup trước push ở **mục 13**. Mục 10–12 giữ kết quả retest/sửa lỗi trước đó. Ảnh, trace và HTML report đã được xóa theo yêu cầu; chạy lại suite để sinh artifact khi cần xem.

> Các mục 1–9 dưới đây là lịch sử ngày 2026-11-16. Kết quả mới nhất ở trên và mục 10 thay thế các giới hạn cũ về quyền Docker hoặc việc chưa chạy IT/E2E/UI với Floci thật. Gate của skill chưa được chạy lại trong đợt retest này.

- Ngày: 2026-11-16 · Bản: `main` trên GitHub (build thẳng từ git URL, không clone)
- Môi trường: Floci 2.4.0 + console (cấu hình giống `docker-compose.yml` của repo, chỉ mở cổng ở 127.0.0.1) · Chromium (Playwright 1.63)
- Region khi chạy: `us-east-1` (lấy từ `AWS_REGION` của shell lúc `docker compose up`, không phải mặc định `ap-southeast-1`)

## 1. Kết quả

| Loại                      | Kết quả                 | Phạm vi                                                                                                                                                      |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UT (vitest)               | ✅ 112/112              | 9 module logic thuần của web: `itemJson`, `expressions`, `searchSummary`, S3 `helpers` / `notificationRules` / `lifecycleRules`, `keyText`, `format`, `json` |
| IT (vitest, gọi thật)     | ✅ 29/29                | `/api/*`, proxy `/aws`, S3, DynamoDB, Redis (`/api/redis`), RabbitMQ (`/api/mq`), dây chuyền S3 / SQS / DynamoDB stream → Lambda                             |
| E2E (Playwright)          | ✅ 13/13                | S3 tạo → upload → preview → xoá · DynamoDB tạo bảng → tạo item → xoá · Lambda tạo → Test → xoá · điều hướng. 1 test đánh dấu bug B1                          |
| UI / responsive (4 khung) | ⚠️ 20/40                | 1440 / 1024 / 768 / 390px: không tràn ngang, đúng 1 h1, có `lang`, menu gập trên phone ✅ · 20 fail đều do bug B2                                            |
| UX component              | 21 trạng thái × 2 khung | Ảnh ở `results/ux/`, ảnh từng trang theo khung ở `results/screens/`                                                                                          |

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
export function selectionLabels<T>(
  noun: string,
  nameOf: (item: T) => string,
): TableProps.AriaLabels<T> {
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

| #   | Vấn đề                                                                                                                                                    | Ảnh                                                                              | Đề xuất                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Upload trên phone: cột Status nằm khuất bên phải (bảng cuộn ngang), lúc upload chỉ thấy tên file                                                          | `results/ux/phone-s3-upload-done.png`                                            | Đổi thứ tự cột thành Name → Status → Size → Type trong `UploadPage.tsx`, hoặc dùng `columnDisplay` ẩn Type/Size khi compact như các bảng khác         |
| U2  | Dòng dài (log trong kết quả Test của Lambda, "Connect your app" trên phone) cuộn trong khung nhưng không thấy là cuộn được (thanh cuộn overlay của macOS) | `results/ux/desktop-lambda-test-result.png`, `results/screens/ui-phone/home.png` | Riêng log: cho xuống dòng (`white-space: pre-wrap`) — thêm prop `wrap` vào `CodeSnippet`; code env giữ cuộn                                           |
| U3  | Modal Add trigger: ô Bucket trống, không có placeholder                                                                                                   | `results/ux/desktop-lambda-add-trigger-modal.png`                                | `FormSelect` chưa nhận `placeholder`: thêm prop và truyền xuống `<Select placeholder=… empty="No buckets">`, rồi dùng `placeholder='Choose a bucket'` |
| U4  | Lỗi validation và dòng gợi ý nói cùng một quy tắc, trên phone chiếm chỗ                                                                                   | `results/ux/phone-s3-create-validation.png`                                      | Trong `ControlledField` (`FormFields.tsx`): khi có `fieldState.error` thì không truyền `constraintText`                                               |
| U5  | Phone: "2.0 KB", "0 functions" xuống dòng                                                                                                                 | `results/ux/phone-s3-objects-table.png`, `results/screens/ui-phone/home.png`     | Không cần sửa; nếu muốn thì `nowrap` cho cột số                                                                                                       |

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

- Báo cáo HTML của Playwright: `results/report/index.html`.
- Chạy lại `test:ui` / `test:ux` sẽ ghi đè ảnh trong `results/screens/`, `results/ux/`.

## 7. Verify bản sửa B1 / B2 / B3 — 2026-11-16

Phạm vi: working tree local trên nhánh `test`; kết quả mục 1 là lần chạy trước trên `main`, không phải lần verify này.

- **B1 đã sửa:** thêm route `*` trong `Layout` và `errorElement` có layout / link về Home. Bỏ `test.fail()` và bổ sung kiểm tra trang not found cùng thao tác về Home trong `e2e/home.spec.ts`.
- **B2 đã sửa:** thêm helper `selectionLabels` và `ariaLabels` cho cả 15 bảng được liệt kê ở B2. Tên chọn từng dòng có loại resource và định danh của dòng.
- **B3 đã sửa cấu hình:** cả cổng console, Floci và dải Redis đều bind host `127.0.0.1`. `docker compose config --format json` xác nhận mọi port mapping có `host_ip=127.0.0.1`.

Kết quả thực chạy:

| Kiểm tra                                 | Kết quả                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`                      | Pass                                                                          |
| `npm test`                               | Pass: server 8/8, web 112/112                                                 |
| `npm run build`                          | Pass; còn cảnh báo kích thước bundle                                          |
| Chromium trên bản build, API/AWS giả lập | Pass 28/28: 2 URL lạ và 5 trang danh sách × 4 khung 1440 / 1024 / 768 / 390px |
| `docker compose config --format json`    | Pass; mọi cổng publish chỉ bind loopback                                      |

Kiểm tra Chromium xác nhận link quay về Home hoạt động, không có trang lỗi mặc định; các trang danh sách S3, DynamoDB, Lambda, ElastiCache và MQ có tên cho control, đúng một h1 và không tràn ngang. Đây là script verify tạm với API giả lập, không phải lần chạy lại đầy đủ bộ `test:ui` với Floci. Các bảng chi tiết còn lại được đối chiếu source và typecheck; nhánh `errorElement` cho lỗi render chưa được fault-injection bằng trình duyệt.

**Giới hạn:** chưa build lại Docker hoặc chạy IT/E2E/UI với Floci thật: user của phiên làm việc không có quyền Docker socket, còn `sudo -n docker ps` yêu cầu xác thực tương tác. Chưa kiểm chứng port binding trên container đang chạy; cần recreate để áp dụng cấu hình mới:

```bash
sudo docker compose up --build -d
npm run test:it -w tests
npm run test:e2e -w tests
npm run test:ui -w tests
```

## 8. UI/UX enhancements U1–U4 — 2026-11-16

GATE: ERROR (the copy (the page showed no <main>, <section> or <h1> to lint); consistency.mjs gave no report (exit 2); check.mjs could not run (exit 2))

- **U1:** Upload columns now appear as Name → Status → Size → Type, bringing progress and completion status before secondary file metadata.
- **U2:** `CodeSnippet` accepts an optional `wrap` prop. Lambda Test log output uses preserved line breaks with wrapping, including long unbroken tokens. Copy still uses the original text; response and environment snippets keep horizontal scrolling.
- **U3:** `FormSelect` forwards optional `placeholder` and `empty` content. The trigger bucket selector shows “Choose a bucket” and “No buckets” when empty.
- **U4:** Shared controlled fields hide constraint text while a validation error is shown and restore it when the error clears.
- **U5:** Left unchanged as the report explicitly marks it optional.

Validation: `npm run typecheck` passed; web unit tests 112/112 passed; server tests 8/8 passed after allowing the temporary loopback listener outside the sandbox; `npm run build` passed with the existing large-bundle warning; `git diff --check` passed.

Design: existing software console and Cloudscape components retained. Voice: short, literal instructions and resource names. No palette/type/hero deal, new effects, moments, photographs, stand-ins, assumed facts, names, contacts or form endpoints were introduced for these component fixes. No waivers were added.

Limitations: the skill gate could not run its browser checks in this environment and returned no usable layout/consistency report. Copy, responsive screenshots, visual layout and performance were not browser-verified in this pass. Full Floci IT/E2E/UI suites were not rerun. Existing B1–B3 working-tree changes were preserved.

## 9. Mobile UI/UX toàn app — 2026-11-16

GATE: ERROR (gate process exited with code 2 before producing a final GATE line).

Gate đã được trỏ vào bản production ở `http://127.0.0.1:5174/`. Lần chạy này dừng sau thông báo bắt đầu, không ghi verdict mới; không tính kết quả gate cũ ở mục 8 là kết quả của đợt này. Checker layout chạy riêng trước đó cũng lỗi `Cannot read properties of undefined (reading 'map')` / `r.sections is not iterable` trên app Cloudscape. Không thêm waiver hoặc sửa bộ checker.

### Thay đổi

- Dùng chung `ResponsiveTable` cho các bảng của Home và cả 5 service: trên khung nội dung hẹp, tên/resource chính ở trên, các cột đang hiển thị còn lại thành thông tin có nhãn ở dưới. Giữ selection, link, Copy, pagination và sorting của Cloudscape; có bộ chọn cột sort và chiều sort khi cần. Hiện số mục đang chọn. Các lựa chọn cột compact hiện có của từng service vẫn được áp dụng.
- `ResponsiveActions` dùng chung cho toolbar và footer: nút tự xuống dòng, footer form/modal rộng toàn khung trên phone, giữ thứ tự nhìn và thứ tự bàn phím giống nhau.
- Tăng vùng thao tác của nút, input/select và lựa chọn radio/checkbox trên phone; input dùng cỡ chữ 16px. Select trong form nhận trạng thái invalid và ref để focus vào field lỗi.
- Menu phone đóng sau khi đi theo link; utilities trên top navigation thu gọn theo Cloudscape. Heading và thông tin dài có thể xuống dòng.
- Home gom icon, tên service, mô tả và số resource vào cùng một dòng dữ liệu trên khung hẹp; số lượng và đơn vị không bị tách dòng.
- Upload đặt tên file, trạng thái, size và type trong cùng dòng dữ liệu trên phone. Log Lambda và plain-text preview S3 xuống dòng; code vẫn cuộn ngang trong khung, có gợi ý và hỗ trợ focus/cuộn bằng bàn phím. Copy giữ nguyên dữ liệu gốc.
- Áp dụng các pattern trên cho list/detail/settings, trigger, monitoring, Redis key/collection và MQ queue/exchange; toolbar chỉnh code Lambda cũng xuống dòng khi thiếu chỗ.

Breakpoint: viewport phone `<=688px`; bảng đo theo **chiều rộng nội dung** `<689px`, nên panel/sidebar hẹp cũng có thể dùng bố cục hai tầng. Mốc `900px` tiếp tục gom action và chọn cột compact; không dùng làm mốc touch/phone.

### Kiểm chứng

| Kiểm tra                            | Kết quả                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck`                 | Pass                                                                      |
| `npm test -w web`                   | 112/112 pass                                                              |
| `npm run build`                     | Pass; còn cảnh báo bundle lớn                                             |
| `test:mobile` trên production build | **21/21 pass**                                                            |
| Chụp lại viewport modal/panel       | 9/9 pass; thêm kiểm tra gõ thật vào MQ payload editor ở 3 khung: 3/3 pass |
| `git diff --check`                  | Pass                                                                      |

21 bài regression bao gồm 66 tổ hợp trang/khung (Home, 5 list và 5 create form × 320 / 390 / 430 / 688 / 768 / 1440px), 18 tổ hợp detail/khung của cả 5 service, cùng các luồng chọn dòng, sort đổi thứ tự thực tế, modal xác nhận, menu, upload tên dài, validation, trigger selector, Redis panel, MQ publish/editor và Lambda log dài. Kiểm tra tên control, tràn ngang, độ rộng bảng và nút submit/select trên phone. Hai race trong selector/đo animation của bài test đã được sửa trước khi xác nhận kết quả cuối.

Ảnh và trace: `tests/results/playwright/mobile/`; ảnh viewport của panel/editor ở `tests/results/playwright/mobile-states/`. Đã review ảnh đại diện của Home, bảng, form, detail, upload, modal, Redis panel, MQ editor và Lambda result; đối chiếu thêm tablet/desktop. Dữ liệu dài trong regression là **API fixtures trong browser**, không tạo hoặc thay đổi resource Floci thật. Cách chạy được ghi trong `tests/README.md`.

### Performance và giới hạn

Skill `perf.mjs` trên production Home, median 3 lần mỗi khung:

| Chỉ số          | 1440px   | 390px    |
| --------------- | -------- | -------- |
| FCP             | 488ms    | 512ms    |
| LCP             | 680ms    | 712ms    |
| Layout shift    | 0.005    | 0.000    |
| Blocking time   | 241ms    | 238ms    |
| Broken requests | 0        | 0        |
| Total transfer  | 900.1KiB | 900.1KiB |

**Open FAIL:** JS parsed 2211.4KiB vượt budget 900KiB của skill ở cả hai khung (2 FAIL). Đây là bundle lớn đã có trước đợt mobile; output build JS chính tăng từ khoảng 2261.53kB ở lần build trước lên 2264.50kB. **WARN giữ lại:** CSS 246.9KiB và 2 ảnh logo do TopNavigation render không có width/height attribute, mỗi cảnh báo xuất hiện ở cả hai khung (4 WARN). Không coi bộ performance là pass; tối ưu bundle chưa được thực hiện trong đợt responsive này.

Gate/layout/copy checker của skill chưa cung cấp kết quả hoàn chỉnh cho cấu trúc app này. Regression dùng Chromium headless với viewport thay đổi, không phải xác nhận trên Safari/iOS/Android thật; bàn phím ảo, safe area và thao tác chạm thực tế chưa được kiểm tra. Chưa chạy lại toàn bộ IT/E2E với Floci thật trong đợt này.

Design: **software**, giữ palette, Open Sans, icon AWS, radius và motion của Cloudscape theo yêu cầu. Voice: nhãn tiếng Anh ngắn, chỉ rõ thao tác/resource. Không deal hero/palette mới hoặc thêm effect/moment/scene cho console thao tác dữ liệu. Không có giả định thương mại, tên thương hiệu mới, ảnh stand-in, client slot, contact hay form endpoint mới. Copy-lint không có báo cáo mới vì gate không hoàn tất. Các bản sửa trước được giữ lại.

<a id="retest-2026-11-17"></a>

## 10. Chạy lại toàn bộ — 2026-11-17

### Môi trường và cách chạy

- Working tree local, nhánh `test/add-test-suites`, HEAD `9ee6433` cùng các thay đổi chưa commit; không phải bản `main` từ GitHub của mục 1.
- Docker Desktop context `desktop-linux` không chạy. Docker hệ thống tại `/var/run/docker.sock` hoạt động (Engine 29.8.2), nên dùng `docker --context default` mà không đổi context mặc định của người dùng.
- `docker --context default compose up --build -d` đã build/recreate cả console và Floci thành công. Console ở `http://127.0.0.1:3701`; `/api/health` trả `ok`, Floci 2.4.0, region `ap-southeast-1`.
- Node 24.14.1; Chrome 154.0.8037.97; Playwright 1.65.0. Browser được chạy headless bằng executable `/usr/bin/google-chrome`.
- `docker inspect` xác nhận **các container đang chạy** publish console `3701`, Floci `4566` và Redis `6379–6399` với `HostIp=127.0.0.1`. Đây là xác nhận runtime cho B3, bổ sung cho kiểm tra cấu hình ở mục 7.

Các lệnh đã chạy từ root:

```bash
npm run typecheck
npm run build
npm test

docker --context default compose up --build -d
npm run test:it -w tests

LOCAL_CONSOLE_URL=http://127.0.0.1:3701 CHROME_PATH=/usr/bin/google-chrome npm run test:mobile -w tests
CHROME_PATH=/usr/bin/google-chrome npm exec -w tests -- playwright test --project=e2e --project=ux '--project=ui-*'
# Chạy lại toàn bộ E2E sau khi sửa assertion S3:
CHROME_PATH=/usr/bin/google-chrome npm run test:e2e -w tests

npm run leftovers -w tests
git diff --check
```

### Kết quả và thay đổi trong test

- **Typecheck/build pass.** Cảnh báo chunk lớn vẫn còn: JS chính 2264.50kB, CSS chính 1324.50kB, code editor tiếp tục lazy-load.
- **Unit 120/120 pass:** server 8/8, web 112/112.
- **IT 29/29 pass**, 6 file, khoảng 55 giây. Gọi API thật: console/proxy, S3, DynamoDB, Redis, RabbitMQ, cùng S3 notification / SQS / DynamoDB stream → Lambda và log kết quả.
- **Mobile 21/21 pass**, khoảng 1.6 phút, trên frontend của image Docker vừa build. Các API trong suite này vẫn là browser fixtures: kết quả này không được tính là integration với Floci. Phạm vi và hành vi kiểm tra giữ như mục 9; gồm thao tác gõ vào MQ payload editor.
- **UI 40/40 pass:** 9 trang × 4 khung và 4 bài điều hướng. Không tràn ngang, heading/lang hợp lệ, control có tên; menu phone mở được và chuyển service đúng. 20 lỗi accessible name B2 của lần chạy gốc không còn tái hiện trong phạm vi suite.
- **UX 3/3 scenario pass:** S3, DynamoDB, Lambda; đã chụp lại 21 trạng thái ở desktop và phone, gồm upload/preview/delete, editor/validation/split panel, code/test result/trigger/monitor.
- **E2E cuối 13/13 pass**, khoảng 21 giây. S3 tạo → upload → preview → xóa, DynamoDB tạo bảng/item → xóa, Lambda tạo → invoke thật → xóa, Home/navigation và unknown route đều qua. B1 được xác nhận lại bằng bài unknown route giữ layout và quay về Home.

Lần chạy gộp đầu có **53 pass, 1 fail, 2 skipped**: test S3 validation tìm dòng constraint text cũ, trong khi U4 cố ý ẩn hint khi có lỗi. Trang thực tế hiện `aria-invalid=true` và lỗi “Use only lowercase letters…” đúng như schema. Hai bài sau bị skip do S3 spec dùng serial mode.

Đã cập nhật `tests/e2e/s3.spec.ts` để kiểm tra lỗi validation thật, hint được ẩn và **không phát sinh PUT `/aws/*`** khi nhập `Bad_Name`; sau đó chạy lại toàn bộ E2E và cả 13 bài đều pass. Không sửa ứng dụng để khớp assertion cũ.

Đã thêm `CHROME_PATH` vào config Playwright dùng chung cho E2E/UI/UX để dùng Chrome hệ thống; tài liệu chạy test đã được cập nhật. Thay đổi phục vụ retest nằm trong test/config/report và các artifact sinh lại.

### Artifact và cleanup

- `results/report/index.html` hiện chứa **13 E2E của lần chạy cuối**. Kết quả 40 UI và 3 UX ở lần chạy gộp đã pass; ảnh tương ứng vẫn nằm ở `results/screens/` và `results/ux/`.
- Mobile screenshots được giữ ở `tests/results/playwright/mobile/` (ignored). Đã lưu tạm trước khi suite dùng chung làm sạch output directory, rồi khôi phục sau E2E.
- Đã kiểm tra lại ảnh đại diện của Home phone, upload thành công với tên file dài và modal Add trigger.
- Đã dọn bucket rỗng `lc-e2e-bucket-mwknwn1690m` bị bỏ lại vì S3 serial spec dừng ở assertion cũ, cùng log group `/aws/lambda/lc-it-fn-mwkntuzfckdm` do IT để lại sau khi xóa function.
- `npm run leftovers -w tests` cuối cùng trả các mảng bucket/table/function/SQS queue rỗng. Kiểm tra thêm qua AWS API cũng không còn replication group, cache cluster hoặc MQ broker có prefix test; CloudWatch test log groups rỗng. Phạm vi kiểm tra là region `ap-southeast-1`; resource hệ thống của Floci không bị tính là rác test.

### Performance trên bản Docker đang chạy

Đã chạy lại `perf.mjs` với Chrome headless tại **`http://127.0.0.1:3701/`**, median 3 lần mỗi khung:

| Chỉ số          | 1440px    | 390px     |
| --------------- | --------- | --------- |
| FCP             | 440ms     | 440ms     |
| LCP             | 612ms     | 624ms     |
| Layout shift    | 0.005     | 0.000     |
| Blocking time   | 220ms     | 224ms     |
| Broken requests | 0         | 0         |
| Total transfer  | 3528.2KiB | 3528.2KiB |
| JS parsed       | 2211.4KiB | 2211.4KiB |
| CSS transfer    | 1293.8KiB | 1293.8KiB |

**6 FAIL còn mở:** total transfer, JS parsed và CSS đều vượt budget của skill ở cả 2 khung. **2 WARN:** logo `mark.svg` được TopNavigation render hai lần mà không có width/height attribute, cảnh báo xuất hiện ở mỗi khung.

Kết quả transfer/CSS khác mục 9 vì lần trước đo qua Vite preview ở `:5174`, còn lần này đo server Express trong Docker ở `:3701`. Kiểm tra HTTP với `Accept-Encoding: gzip, br` cho JS/CSS vẫn không có `Content-Encoding`, Content-Length lần lượt là **2264508** và **1324506** bytes. Vì vậy kết quả mới không được diễn giải thành thay đổi dung lượng code do UI mobile; đây là phép đo trên cách phục vụ asset production hiện tại. Tối ưu/nén asset chưa được thực hiện trong đợt retest.

### Giới hạn còn lại

- Các suite chức năng được liệt kê đều pass, nhưng **performance không pass**. Không có claim `GATE: PASS`: checker/gate lỗi ở đợt trước chưa chạy lại trong đợt này.
- Browser là Chromium headless với viewport thay đổi; chưa xác nhận Safari/iOS/Android, bàn phím ảo hay thao tác chạm trên thiết bị thật.
- UI responsive kiểm tra các trang của suite; mobile regression dùng fixtures. Không coi đó là browser E2E thật cho mọi thao tác Redis/MQ, dù API integration Redis/MQ đã pass.
- Nhánh `errorElement` cho component throw vẫn chưa fault-injection bằng browser; bài unknown route chỉ xác nhận fallback route.

## 11. Sửa khoảng trống mép phải trên mobile — 2026-11-17

Ảnh người dùng cho thấy header/nội dung bị thu hẹp, chừa dải trống bên phải trong mobile viewport. Nguyên nhân: `html { scrollbar-gutter: stable }` được áp dụng cho mọi kích thước, kể cả phone dùng scrollbar overlay.

- Sửa `web/src/shared/Layout.css`: mặc định `scrollbar-gutter: auto`; chỉ bật `stable` từ 689px trở lên để giữ hành vi desktop.
- Thêm `tests/mobile/viewport.spec.ts`: touch emulation (`isMobile`, `hasTouch`) tại 390/430px, kiểm tra header phủ hết viewport và không còn gutter dự phòng; thêm kiểm tra desktop 1440px vẫn giữ gutter.
- Trước sửa, 2 bài phone fail vì computed gutter là `stable`; bài desktop pass. Sau sửa và rebuild Docker console, **24/24 mobile regression pass**, gồm 21 bài cũ và 3 bài mới; `git diff --check` pass. Build Docker đã chạy `tsc -b` và Vite thành công.
- Bộ kiểm tra trước chỉ so sánh scrollWidth/clientWidth để bắt tràn ngang; cả hai cùng bị thu hẹp bởi gutter nên đã bỏ sót khoảng trống này. Test mới kiểm tra thêm mép header so với `window.innerWidth`.
- Bản Docker sửa lỗi đã được phục vụ ở `http://localhost:3701`. Ảnh sau sửa nằm ở `tests/results/playwright/mobile/viewport-touch-viewport-*/home-touch.png`.

Các số liệu UT/IT/E2E/UI/UX và performance ở mục 10 là kết quả trước bản sửa CSS nhỏ này, không phải các bộ vừa chạy lại ở mục 11. Đợt này chạy lại build và toàn bộ mobile regression; chưa kiểm tra trên thiết bị thật.

## 12. Sửa nút Refresh bị bóp trên mobile — 2026-11-17

Lỗi được người dùng làm rõ là nút Refresh bị thành oval đứng. CSS mobile tăng `min-height` lên 44px, nhưng `min-width` bị `min-inline-size` có specificity cao hơn của Cloudscape ghi đè nên nút vẫn hẹp khoảng 32px.

- Sửa rule cho các button chỉ có icon trong `Layout.css`: đặt cả inline/block size và min size là **44px**, không co theo flex, căn icon giữa bằng inline-flex và dùng border-radius 50%. Rule nằm trong breakpoint phone; màu sắc, hover/focus và desktop tiếp tục dùng Cloudscape.
- Thêm `mobile/icon-buttons.spec.ts`: ở 320 / 390 / 430px, đi qua Home và cả 5 service, đo kích thước nút và vị trí tâm SVG. Kiểm tra chiều rộng/cao bằng nhau, vùng chạm ít nhất 44px và icon lệch tâm dưới 1px.
- Test mới đã fail trên bản trước sửa ở 390px. Sau rebuild Docker, 3 bài kích thước/icon đã pass, cùng 6 bài kiểm tra mọi trang ở các khung; đã xem ảnh Home sau sửa và xác nhận nút tròn, icon giữa.
- Runner đầu bị SIGTERM (exit 143) sau 9 bài hoàn tất và không có assertion fail trong các bài đó. Đã chạy riêng **18/18 bài còn lại, tất cả pass**. Tổng cộng **27 case của suite đã được kiểm tra thành công qua 2 đợt**, không ghi nhận một lần chạy liền mạch 27/27.
- Docker build (`tsc -b` + Vite) và `git diff --check` pass. Bản sửa đang được phục vụ tại `http://localhost:3701`.
- Ảnh Refresh: `tests/results/playwright/mobile/icon-buttons-*/home-refresh.png`; ảnh các luồng chạy bổ sung: `tests/results/playwright/mobile-interactions/`.

Đợt này kiểm tra build và mobile regression. Các kết quả UT/IT/E2E/UI/UX/performance ở mục 10 không được tính là đã chạy lại sau thay đổi CSS này.

## 13. UI/UX retest cuối và dọn artifact trước push — 2026-11-17

Kiểm tra bản production Docker đang phục vụ tại `http://127.0.0.1:3701`, sau cả hai bản sửa gutter và nút Refresh. Floci 2.4.0, region `ap-southeast-1`, Chrome hệ thống headless. Không sửa mã ứng dụng trong đợt này vì không phát hiện lỗi UI/UX mới trong phạm vi kiểm tra.

| Nhóm                                 | Kết quả                                    |
| ------------------------------------ | ------------------------------------------ |
| Responsive desktop/laptop            | 20/20 pass                                 |
| Responsive tablet/phone              | 20/20 pass                                 |
| UX thật: S3, DynamoDB, Lambda        | 3/3 scenario pass; 21 trạng thái × 2 khung |
| Mobile Refresh + touch viewport      | 6/6 pass                                   |
| Mobile main pages ở 6 khung          | 6/6 pass, mỗi bài đi qua 11 trang          |
| Mobile tương tác/detail/modal/editor | 15/15 pass                                 |

Tổng **40/40 responsive UI, 3/3 UX, 27/27 mobile**. Chạy tuần tự theo các nhóm có output riêng; không có assertion fail, skip hay runner bị ngắt trong đợt này. Mobile dùng API fixtures; UI/UX dùng Floci thật. Đã xem lại ảnh đại diện Home ở desktop/phone, form laptop, upload tên dài, validation trong item editor, modal Add trigger, MQ publish/editor ở 320px và Redis panel. Refresh tròn và căn giữa, không còn dải gutter dự phòng trên phone.

Các lệnh (Chrome executable lấy từ `CHROME_PATH=/usr/bin/google-chrome`; mobile đặt thêm `LOCAL_CONSOLE_URL=http://127.0.0.1:3701`):

```bash
npm exec -w tests -- playwright test --project=ui-desktop --project=ui-laptop --output results/playwright/review-wide
npm exec -w tests -- playwright test --project=ui-tablet --project=ui-phone --output results/playwright/review-narrow
npm run test:ux -w tests -- --output results/playwright/review-ux
npm run test:mobile -w tests -- icon-buttons.spec.ts viewport.spec.ts --output results/playwright/review-mobile-controls
npm run test:mobile -w tests -- responsive.spec.ts --grep 'all main pages fit' --output results/playwright/review-mobile-pages
npm run test:mobile -w tests -- responsive.spec.ts --grep-invert 'all main pages fit' --output results/playwright/review-mobile-interactions
npm run leftovers -w tests
git diff --check
```

Cleanup test resources: `leftovers` trả bucket/table/function/SQS queue rỗng.

Sau khi kiểm tra xong, đã xóa **toàn bộ `tests/results/`** (ảnh, trace, HTML report và artifact sinh ra) theo yêu cầu chuẩn bị push. Thư mục này có **79 file đã được track: 78 PNG và 1 HTML**, nay được đánh dấu xóa. Đồng thời xóa các ảnh sinh ra trong `.taste-skill/` và `.playwright-mcp/`; giữ nguyên icon/asset của ứng dụng.

Đã ignore toàn bộ `tests/results/` và cập nhật `tests/README.md` để artifact lần chạy sau không lọt vào commit. Các đường dẫn ảnh/report trong phần lịch sử chỉ còn là tham chiếu tới output có thể tạo lại, không phải file đang được kèm repo. Báo cáo chữ và source test vẫn được giữ.

Giới hạn: không phải kiểm tra trên thiết bị thật. Các finding performance và trạng thái gate ở mục 10 chưa được đo/chạy lại trong đợt UI/UX này; kết quả pass ở đây không được dùng để đóng chúng. Chưa commit hoặc push.

## 14. Test lại toàn bộ sau khi tách core — 2026-11-27

Chạy theo [plan core](../docs/superpowers/plans/2026-11-27-core.md) Task 25 trên console Docker build lại từ working tree (`docker compose up --build -d`), Floci 2.4.0 `ap-southeast-1`. Mỗi task tách service trước đó đã chạy E2E riêng của service đó; đây là lượt chạy toàn bộ.

### Lỗi gặp khi chạy và đã sửa (do tách core, không phải lỗi tính năng)

| Bộ     | Hiện tượng                                                                                | Nguyên nhân                                                                                                                                                                                 | Sửa                                                                                              |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| IT     | `it/apigateway.test.ts`, `it/cognito.test.ts` lỗi lúc import (33 file khác: 202/202 pass) | Test import thẳng file `web/src/...` đã dời sang `core/`                                                                                                                                    | Trỏ sang `core/src/...`; `testInvokeUrl` nhận thêm đường gốc (`AWS_PROXY_PATH`). Chạy lại: 18/18 |
| E2E    | `apigateway.spec.ts` không nạp được (phát hiện ở Task 20)                                 | Như trên (`CFN_API_TYPES`)                                                                                                                                                                  | Import từ `core/src/services/apigateway/constants.ts`                                            |
| Mobile | Cả bộ fail (trang không có heading, timeout 1 phút)                                       | Fixture chặn mọi URL khớp glob `**/aws/**`; vite dev phục vụ module core như `/@fs/…/core/src/shared/aws/errors.ts` nên module bị trả `{}`, app không chạy. Bản build không bị vì đã bundle | `mobile/fixtures.ts` chỉ chặn `pathname` bắt đầu bằng `/aws/` hoặc `/api/`. Chạy lại: 36/36      |

### Bundle (gzip, so với `tests/bundle/baseline.json`)

| Phần           | Mốc (trước khi tách) | Sau khi tách | Chênh |
| -------------- | -------------------- | ------------ | ----- |
| Chunk `index`  | 214 KB               | 213 KB       | −0,5% |
| Lần tải đầu    | 350 KB               | 346 KB       | −1,1% |
| `QueueList`    | 621 KB               | 592 KB       | −4,7% |
| `QueueDetail`  | 707 KB               | 713 KB       | +0,8% |
| `FunctionList` | 598 KB               | 603 KB       | +0,8% |

SDK trong lần tải đầu: không. Trong lúc tách CloudFormation (Task 24) lần tải đầu từng lên 453 KB: `useResourceIndex` gọi `import("@localconsole/core/cloudformation")` trong khi layout import tĩnh cùng barrel đó, Rollup coi mọi export là được dùng và kéo SDK + zod vào lần tải đầu. Đã đổi sang `import()` file `stackLookup.ts` (import tên cụ thể); ghi ở `docs/development.md` › Traps.

### Leftover

Trước lượt này Floci còn resource test của các lượt trước (log group do Lambda / RDS / DocumentDB / ElastiCache tự tạo, revision task definition do stack tạo, 1 broker, tin SMS). User đã chạy `npm run leftovers -w tests -- --delete`; kiểm lại chỉ còn 73 tin SMS (hộp thư giả của Floci, không có API xóa).

### Lệnh

```bash
npm run typecheck && npm run lint && npm test
docker compose up --build -d
npm run test:it -w tests
npm run test:e2e -w tests
npm run test:ui -w tests
npm run test:ux -w tests
npm run dev:web            # cửa sổ khác, rồi:
npm run test:mobile -w tests
npm run build -w web && npm run bundle -w tests
npm run leftovers -w tests
```

## 15. API Gateway — đối chiếu spec và test bổ sung — 2026-11-27

Đối chiếu [spec API Gateway](../docs/superpowers/specs/2026-11-19-apigateway-design.md) (mục 2, 3, 5, 7) với test đang có. ★ = test thêm trong đợt này.

| Tính năng / tình huống (spec)                                                                  | Test                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh sách REST, HTTP, WebSocket; tìm; xóa (3.1)                                                | E2E `lists APIs of all three types`, `deletes an API`, `deletes an API from its detail page`; IT `lists REST, HTTP and WebSocket APIs…`, `deletes REST and HTTP APIs` |
| Chi tiết, tab theo loại API, API không có (3.2, 5)                                             | E2E `opens an API from the list`, `an unknown API shows not found`; IT `reports an unknown REST API as not found…`                                                    |
| ★ API bị xóa khi đang mở trang (plan Task 26)                                                  | E2E `API deleted while its page is open › the next tab shows Floci's error and a reload shows not found`                                                              |
| Cây resource + overview method; `AWS_IAM` (3.3)                                                | E2E `shows the resource tree and method overview`, `an AWS_IAM method says Floci checks only the signature`; IT `reads resources with embedded methods`               |
| Routes HTTP / WebSocket, route selection (3.4)                                                 | E2E `lists HTTP routes with integration and authorizer`, `shows the WebSocket route selection`                                                                        |
| Authorizers: link pool / function, JWT issuer local (3.5)                                      | E2E `REST authorizers link to the pool and the function`, `a local JWT issuer has a popover`                                                                          |
| Invoke URL gọi được: REST, HTTP `$default`, WebSocket (3.8, 7 #11, #15)                        | IT `the invoke URL from Stages answers` (REST + HTTP), `the WebSocket URL connects`; E2E 3 test tab Stages                                                            |
| Gọi thử method: path / query / header / body, body editor, header sai, API chưa có stage (3.7) | E2E 6 test `testing a REST method`; IT `path param, query, header and body reach the Lambda`                                                                          |
| Route → Lambda; Lambda không tồn tại → 404 (7 #5)                                              | IT `a deleted Lambda answers 404 with the Floci message`; E2E `shows errors verbatim`                                                                                 |
| ★ Lambda lỗi → 502 body rỗng (7 #5)                                                            | IT `a Lambda that throws answers 502 with an empty body`                                                                                                              |
| ★ Không có `lambda:AddPermission` vẫn gọi được (7 #12)                                         | IT `reaches the Lambda without lambda:AddPermission…`                                                                                                                 |
| Authorizer Cognito: 401 không token, 200 có IdToken (7 #9)                                     | IT + E2E `a Cognito method answers 401 without a token and 200…`                                                                                                      |
| ★ Lambda TOKEN authorizer: 401 / 403 Deny / 200 Allow (7 #9)                                   | IT `a Lambda TOKEN authorizer answers 401 without a token, 403 on Deny, 200 on Allow`                                                                                 |
| ★ `AWS_IAM` gọi không ký → 403 (7 #18)                                                         | IT `an AWS_IAM method answers 403 Missing Authentication Token to an unsigned call`                                                                                   |
| Lambda › Triggers từ policy; không policy; API đã xóa (3.9)                                    | E2E 3 test `Lambda triggers`; IT `AddPermission with an execute-api SourceArn comes back from GetPolicy and parses`                                                   |
| CloudFormation: physical ID, link qua lại (3.2)                                                | IT 2 test `CloudFormation`; E2E `… resource links to its API page, which links back to the stack`                                                                     |
| Mobile các trang API Gateway                                                                   | Mobile suite 36/36 (mục 14)                                                                                                                                           |

Kết quả: `apigateway.spec.ts` pass trong lượt E2E toàn bộ (283/283), `it/apigateway.test.ts` 16/16. **Không phát hiện lỗi tính năng.** Hành vi khi API bị xóa lúc đang mở trang: header giữ dữ liệu cũ (query không tự tải lại khi focus), tab mở tiếp hiện lỗi của Floci kèm nút Retry, tải lại trang thì báo "API … not found"; trang không trắng.

Chưa kiểm (ngoài phạm vi spec hoặc Floci không hỗ trợ): API key bắt buộc (spec để sau), v2 `IntegrationSubtype` và integration S3 (Floci không chạy, 7 #6–#7), `AWS_IAM` ký bằng user không có quyền (7 › Chưa kiểm).

## 16. API Gateway với service khác — 2026-11-27

Theo yêu cầu test kỹ phần API Gateway nối với service khác (spec API Gateway mục 2 › Liên kết với service khác, 7 #5–#14). File mới: `tests/it/apigateway-integrations.test.ts` (12 test), `tests/e2e/apigateway-integrations.spec.ts` (4 test). Gọi qua proxy `/aws` của console (đường tab Test dùng) rồi kiểm dữ liệu ở service đích bằng SDK. Dạng URI / template theo [khảo sát Floci](../docs/superpowers/researchs/2026-11-19-floci-survey/apigateway.md).

| Nối với                                | Kiểm                                                                                                                  | Kết quả                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| SQS (REST `AWS`, path + template form) | Body thành message trong queue (IT); qua UI: Overview "AWS → sqs" + URI, Test có header JSON → queue nhận (E2E)       | ✅                          |
| SNS Publish (template JSON)            | Queue subscribe vào topic nhận message                                                                                | ✅                          |
| DynamoDB PutItem                       | Item được ghi đúng                                                                                                    | ✅                          |
| Step Functions StartExecution          | Execution được tạo, response có `executionArn`                                                                        | ✅                          |
| EventBridge PutEvents                  | Rule trên bus chuyển event sang queue (source, detail-type, detail đúng)                                              | ✅                          |
| Lambda non-proxy (`AWS`)               | Function nhận body, response là giá trị trả về (IT); qua UI: Test ra body, link "Lambda → fn" mở trang function (E2E) | ✅                          |
| Lambda proxy → CloudWatch Logs         | Test → link "Lambda logs: fn › Monitor" → Monitor hiện dòng log của lần gọi (E2E)                                     | ✅                          |
| Lambda REQUEST authorizer              | Thiếu header 401, Deny 403, Allow 200                                                                                 | ✅                          |
| Cognito JWT (HTTP API)                 | Issuer Cognito local → 401 kể cả token hợp lệ (đúng như spec 7 #14; console có popover)                               | ✅ (ghi lại giới hạn Floci) |
| Lambda › Triggers (authorizer)         | Permission `…/authorizers/<id>` đọc lại từ GetPolicy thành nguồn "authorizers"                                        | ✅                          |
| WebSocket + Lambda + `@connections`    | Lambda nhận connection id; POST `@connections/<id>` đẩy tin xuống client                                              | ✅                          |
| S3 (REST `AWS`)                        | Floci không chạy: không ghi object, trả lỗi `MissingAction`                                                           | ✅ (ghi lại giới hạn Floci) |
| HTTP API `IntegrationSubtype` SQS      | Floci không chạy: 500, queue không có tin                                                                             | ✅ (ghi lại giới hạn Floci) |

Chạy 2 lượt liên tiếp: IT API Gateway 28/28 (16 cũ + 12 mới), E2E API Gateway 31/31 (27 cũ + 4 mới; test của lỗi B4 dưới đây xanh sau khi sửa).

### Lỗi tính năng tìm được

**B4 — Tab Test của method REST gửi body với `Content-Type: text/plain`, mapping template `application/json` không chạy · Mức: Trung bình · Đã sửa 2026-11-27**

- Tái hiện: REST method `POST /orders` tích hợp `AWS` tới SQS với `requestTemplates: { "application/json": "Action=SendMessage&MessageBody=$util.urlEncode($input.body)" }` (dạng CDK hay dùng). Mở tab Test, nhập body `{"from":"default"}`, không nhập header, bấm Test.
- Mong đợi: như AWS (request không có Content-Type được coi là `application/json`): message vào queue.
- Thực tế: tab Test hiện **Status 200** với body `{"errorMessage":"The request must contain the parameter Action","errorType":"MissingAction"}`, queue không có tin. Người dùng dễ tưởng đã gửi được.
- Nguyên nhân: `useMethodTest` gọi `fetch(url, { body })` với body là chuỗi nên trình duyệt tự đặt `Content-Type: text/plain;charset=UTF-8`; Floci chọn template theo Content-Type nên không áp template nào. Đã kiểm: không gửi Content-Type → chạy đúng; `application/json` → chạy đúng; `text/plain` → lỗi trên.
- Ảnh hưởng: mọi method dùng mapping template (integration `AWS` tới SQS, SNS, DynamoDB, Step Functions, EventBridge, Lambda non-proxy có template). Lambda proxy không bị.
- Cách tránh hiện tại: nhập header `Content-Type: application/json` ở ô Headers.
- Đã sửa: `web/src/services/apigateway/hooks/useMethodTest.ts` gửi body dạng `Blob` không type, nên request không có Content-Type (trừ khi người dùng tự nhập) và Floci coi là `application/json` như AWS.
- Test: E2E `Test without a Content-Type header queues the body like AWS does` đỏ trước khi sửa (queue không có tin), xanh sau khi sửa; E2E API Gateway 31/31, unit 629/629.

### Chỉnh lại mô tả trong spec

Spec API Gateway (mục 2 › Liên kết, mục 5) ghi integration S3 "Test ra 500". Thực tế trên Floci 2.4.0 status theo integration response của method: với integration response mặc định 200 (như CDK tạo) thì Test ra **200** kèm lỗi `MissingAction`, không ghi object. Không có integration response thì mới ra lỗi 5xx.
