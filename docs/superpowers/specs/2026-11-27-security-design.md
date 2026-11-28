# Bảo mật — Thiết kế

> Ngày: 2026-11-27 · Trạng thái: **chờ duyệt** · Plan: [2026-11-27-security](../plans/2026-11-27-security.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · Thứ tự (user chốt 2026-11-27): [tách core](2026-11-27-core-design.md) → test lại toàn bộ → test kỹ API Gateway → [MCP server](2026-11-27-mcp-server-design.md) → **bảo mật**

## 1. Mục tiêu

Local Console chỉ chạy trên máy dev, nên **cân bằng trải nghiệm và bảo mật**, không gia cố mọi thứ (user chốt 2026-11-27).

**Nguyên tắc:** console không được làm hệ thống kém an toàn hơn khi chỉ chạy Floci. Floci ở cổng `4566` vốn đã mở hoàn toàn (mục 6), nên đăng nhập, token hay HTTPS cho console không chặn được gì: kẻ tấn công cứ gọi thẳng Floci. Chỉ chặn những rủi ro **do console tự thêm vào**.

Rà soát ngày 2026-11-27 gồm: server (proxy `/aws`, `localOnly`, route Redis / RabbitMQ), web (chỗ render HTML, iframe, credential), compose và Dockerfile, Floci cổng `4566`, dependency (`npm audit --omit=dev`: 0 lỗ hổng), thiết kế MCP.

---

## 2. Phạm vi

### Làm

| #   | Việc                                                                                | Rủi ro chặn được                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Chế độ dev bind `127.0.0.1`; image Docker bind `0.0.0.0` qua env                    | `npm run dev:server` hiện lắng nghe mọi interface. Máy khác trong LAN đặt header `Host: localhost` là qua được `localOnly`, dùng được `/aws` (cả reset Floci), `/api/redis`, sau này là `/mcp` với CRUD đầy đủ |
| 2   | Header `X-Frame-Options: DENY` cho mọi response                                     | Trang lạ nhúng console vào iframe rồi lừa user bấm (vd: Reset data). Request từ console trong iframe là same-origin nên `localOnly` không chặn                                                                 |
| 3   | DocumentDB chỉ in lệnh `socat` / `docker stop` khi tên cluster chỉ gồm chữ, số, `-` | Floci nhận tên cluster bất kỳ (form của console tự kiểm, xem `IDENTIFIER_PATTERN`). Tên kiểu `x;<lệnh>` tạo từ ngoài console thành lệnh shell lạ khi dev copy và chạy                                          |
| 4   | Ghi rủi ro được chấp nhận vào tài liệu (mục 3)                                      | User biết giới hạn, tự chọn cách dùng                                                                                                                                                                          |

Rủi ro riêng của MCP (prompt injection, thao tác xóa, Reset, credential RabbitMQ) nằm ở [spec MCP](2026-11-27-mcp-server-design.md), mục 7. Việc 1 cũng che `/mcp`, vì `/mcp` dùng chung `localOnly`.

### Chấp nhận, chỉ ghi tài liệu

| Rủi ro                                                                                                 | Vì sao chấp nhận                                          | Ghi ở                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------- |
| Floci nhận request không ký từ mọi trang (CSRF mù), không kiểm `Host` (DNS rebinding đọc được dữ liệu) | Lỗ của Floci, console không vá được; LocalStack cùng loại | `development.md` › Traps; README mục Security |
| Floci tự bật console (`/_floci/ui`) publish cổng `4500` trên mọi interface (`-p 4500:4500`)            | Cách chạy của Floci, không phải compose của README        | README mục Security                           |
| Lỗi trả nguyên `message` ra ngoài                                                                      | Có ích khi debug, chỉ ở local                             | —                                             |

### Không làm

| Việc                                   | Lý do                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Đăng nhập / token cho console hoặc MCP | Floci cạnh bên vẫn mở; phá trải nghiệm không cần cấu hình                               |
| HTTPS, rate limit                      | Chỉ chạy local                                                                          |
| CSP đầy đủ cho trang                   | Cloudscape + Vite cần thử kỹ; rủi ro XSS hiện thấp (mục 6). Chỉ thêm chống nhúng iframe |
| Báo issue cho Floci                    | User chọn sau (không bắt buộc)                                                          |

---

## 3. Tài liệu cho user

**README**, thêm mục ngắn `## 🔒 Security` sau "Connect your app":

- Console và Floci không có đăng nhập: ai gọi được cổng `3701` / `4566` là điều khiển được mọi service. Compose của README chỉ mở cổng trên `127.0.0.1`; đừng đổi sang `0.0.0.0`.
- Trang web lạ đang mở trong trình duyệt có thể gửi request tới Floci (`localhost:4566`): tắt Floci khi không dùng (`docker compose stop`).
- Nếu để Floci tự bật console (`FLOCI_SERVICES_UI_IMAGE`), cổng `4500` mở trên mọi interface.

**`docs/development.md` › Traps**, sửa mục `localOnly` (dòng hiện có) và thêm:

- Server bind theo `BIND_ADDRESS` (mặc định `127.0.0.1`, image đặt `0.0.0.0` theo console contract). Chạy dev mà cần máy khác vào (vd: test trên điện thoại) thì đặt `BIND_ADDRESS=0.0.0.0` và biết là cả LAN điều khiển được Floci.
- Floci 2.4.0 nhận request không ký từ mọi origin (form POST `Action=ListQueues` kèm `Origin` lạ → 200) và không kiểm `Host` (`Host: evil.example` → 200), kiểm 2026-11-27.

---

## 4. Kỹ thuật

### 4.1 Địa chỉ bind

- `server/src/constants.ts`: bỏ hằng `BIND_ADDRESS = "0.0.0.0"`, thêm `DEFAULTS.bindAddress = "127.0.0.1"`.
- `server/src/config.ts`: thêm `BIND_ADDRESS: z.string().min(1).default(DEFAULTS.bindAddress)`.
- `server/src/index.ts`: `listen(config.PORT, config.BIND_ADDRESS, …)`.
- `Dockerfile`: `ENV … BIND_ADDRESS=0.0.0.0 …`. Console contract của Floci bắt buộc bind `0.0.0.0` ("The console MUST bind `0.0.0.0`"); compose giới hạn ra ngoài bằng `127.0.0.1:3701:3701`.
- Vite proxy `http://localhost:3701` vẫn chạy: Node thử cả IPv4 và IPv6 khi `localhost` có hai địa chỉ (test `AggregateError` hiện có trong `server/test/app.test.ts` cho thấy hành vi này). Kiểm lại trong plan bằng `npm run dev:web`.

### 4.2 Chống nhúng iframe

- `server/src/constants.ts`: `NO_FRAMING_HEADER = { "X-Frame-Options": "DENY" }`.
- `server/src/app.ts`: middleware đầu tiên `response.set(NO_FRAMING_HEADER)`, áp cho cả trang tĩnh, `/api`, `/aws`.
- Không ảnh hưởng iframe xem trước mail SES (`srcDoc`, không tải URL của console). Floci mở console bằng **redirect** sang cổng riêng, không dùng iframe (tài liệu Floci UI, đọc 2026-11-27), nên `DENY` không làm hỏng chế độ đó.
- Dev mode (`:5173`) do Vite phục vụ trang nên không có header; chấp nhận (chỉ dev).

### 4.3 Tên DocumentDB trong lệnh shell

- `web/src/services/docdb/constants.ts`: `SHELL_SAFE_NAME = /^[A-Za-z0-9-]+$/`. Không dùng `IDENTIFIER_PATTERN` vì Floci giữ chữ hoa nếu app tạo cluster tên có chữ hoa (vẫn an toàn trong shell); thêm `TEXT.unsafeName`.
- `web/src/services/docdb/clusters.ts`: `isShellSafe(cluster)`.
- `ConnectivityTab.tsx`: tên an toàn → như hiện nay; không an toàn → `Alert` cảnh báo thay cho khối lệnh `socat`, connection string localhost và ghi chú `docker stop`.

### Package cần cài

Không.

---

## 5. Test

| Loại                                         | Nội dung                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit `server/test/app.test.ts`               | Response có `X-Frame-Options: DENY`; `loadConfig({})` cho `BIND_ADDRESS` `127.0.0.1`; `BIND_ADDRESS=0.0.0.0` đọc được                                |
| Unit `web/test/services/docdb/docdb.test.ts` | `isShellSafe`: `orders-db`, `Orders1` đúng; `x;rm -rf ~`, `a$(id)`, `` a`id` ``, `a b`, `a'b`, chuỗi rỗng sai                                        |
| Chạy tay                                     | `npm run dev:server`: log in `127.0.0.1`; từ máy khác trong LAN không vào được. `docker compose up --build`: console vẫn chạy, health Floci vẫn xanh |
| E2E                                          | `tests/e2e/docdb.spec.ts` giữ nguyên (tên test hợp lệ)                                                                                               |

---

## 6. Rủi ro đã kiểm tra (2026-11-27)

| #   | Kiểm                                                                                                          | Kết quả                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `curl -X POST -H "Origin: http://evil.example" --data "Action=ListQueues&Version=2012-11-05" localhost:4566/` | 200, trả danh sách queue: Floci không kiểm chữ ký hay origin                                                     |
| 2   | Preflight `OPTIONS` từ origin lạ                                                                              | 405, không có `Access-Control-Allow-Origin`: trang lạ không **đọc** được kết quả qua `fetch` (chỉ gửi mù)        |
| 3   | `curl -H "Host: evil.example:4566" localhost:4566/_floci/health`                                              | 200: DNS rebinding tới Floci đọc được dữ liệu                                                                    |
| 4   | `localOnly` của console                                                                                       | Chặn `Sec-Fetch-Site` cross-site / same-site và `Host` lạ; request không phải trình duyệt đi qua (đúng thiết kế) |
| 5   | Iframe mail SES                                                                                               | `sandbox="allow-popups allow-popups-to-escape-sandbox"`, không có `allow-scripts` / `allow-same-origin`          |
| 6   | Không có `dangerouslySetInnerHTML`, `innerHTML`, `eval` trong web                                             | Đúng (grep 2026-11-27)                                                                                           |
| 7   | Credential RabbitMQ                                                                                           | Chỉ ở `sessionStorage` của trình duyệt, server không lưu                                                         |
| 8   | `npm audit --omit=dev`                                                                                        | 0 lỗ hổng                                                                                                        |

---

## 7. Thứ tự làm

1. Bind address (server, Dockerfile, test).
2. Header chống iframe (server, test).
3. Tên DocumentDB (web, test).
4. Tài liệu (README, development.md).
5. Typecheck, unit test, chạy tay dev và Docker.

---

## 8. Quyết định

| Ngày       | Quyết định                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-27 | Cân bằng UX và bảo mật; console không làm hệ thống kém an toàn hơn Floci đứng một mình                                                                                                                               |
| 2026-11-27 | Làm bind dev `127.0.0.1`, chống iframe, tên DocumentDB an toàn trong shell. Làm **sau** MCP (bước cuối của chuỗi core → test → MCP → bảo mật); trong lúc chờ, `/mcp` ở chế độ dev cũng lộ ra LAN như `/aws` hiện nay |
| 2026-11-27 | Không đăng nhập / token / HTTPS / rate limit; rủi ro của Floci chỉ ghi tài liệu                                                                                                                                      |
