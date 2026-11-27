# Tests

IT, E2E và UI chạy kiểu hộp đen vào console đang chạy. Unit test của web nằm ở `web/test/`.

## Chạy

```bash
docker compose up --build -d          # console :3701 + Floci :4566
npm run test:it -w tests              # IT: API console, S3, DynamoDB, Redis, RabbitMQ, dây chuyền → Lambda
npm run test:e2e -w tests             # E2E trên UI (desktop)
npm run test:ui -w tests              # layout / heading / tên control trên 4 khung 1440 · 1024 · 768 · 390
npm run test:ux -w tests              # chụp component ở các trạng thái, ảnh trong results/ux/
npm run leftovers -w tests            # liệt kê resource lc-it-* / lc-e2e-* còn sót (thêm -- --delete để xoá)
npm run build -w web && npm run bundle -w tests   # so bundle với mốc bundle/baseline.json (ngưỡng 5%, không SDK trong lần tải đầu)
```

- Console ở cổng khác: `LOCAL_CONSOLE_URL=http://localhost:3702 npm run test:it -w tests`
- Báo cáo lần test gần nhất: [REPORT.md](REPORT.md)
- Toàn bộ `tests/results/` là artifact sinh lại được (ảnh, HTML report, trace), được ignore và không commit. Chạy lại suite tương ứng để tạo ảnh/report khi cần review.
- Test tạo resource có tiền tố `lc-it-` / `lc-e2e-` và tự xoá khi chạy xong

## Mobile regression (API fixtures)

Chạy frontend từ root repo trong một terminal:

```bash
npm run dev:web
```

Ở terminal khác:

```bash
npm run test:mobile -w tests
# Nếu dùng Chrome đã cài trên Linux thay cho Chromium của Playwright:
CHROME_PATH=/usr/bin/google-chrome npm run test:mobile -w tests
```

Suite này dùng API fixtures trong browser, không cần Floci/backend và không tạo hay xóa resource thật. Mặc định kiểm tra `http://127.0.0.1:5173`; dùng `LOCAL_CONSOLE_URL` để đổi địa chỉ frontend.

- Home, 5 danh sách và 5 form tạo: 320 / 390 / 430 / 688 / 768 / 1440px; tràn ngang, tên control, độ rộng bảng và nút submit trên phone.
- Trên 320 / 390 / 430px: tên dài, chọn dòng, thứ tự sort thực tế, modal xác nhận, điều hướng, upload, validation, trigger selector, detail của cả 5 service, panel Redis, MQ publish và Lambda log dài.
- Ảnh từng trang/trạng thái và trace lúc fail nằm trong `results/playwright/mobile/` (không commit).
- Không thay thế IT/E2E với Floci thật; bàn phím ảo và thao tác chạm trên thiết bị thật cần kiểm tra riêng.

Có thể kiểm tra bản production thay vì dev server:

```bash
npm run build
npm exec -w web -- vite preview --host 127.0.0.1 --port 5174
# Terminal khác:
LOCAL_CONSOLE_URL=http://127.0.0.1:5174 CHROME_PATH=/usr/bin/google-chrome npm run test:mobile -w tests
```

Các suite E2E/UI/UX cũng nhận `CHROME_PATH` khi muốn dùng Chrome có sẵn, ví dụ `CHROME_PATH=/usr/bin/google-chrome npm run test:ui -w tests`.

`mobile/viewport.spec.ts` bổ sung touch emulation (`isMobile`, `hasTouch`) ở 390/430px: header phải phủ hết viewport, không chừa scrollbar gutter trên phone; desktop vẫn giữ gutter để tránh layout nhảy.

`mobile/icon-buttons.spec.ts` kiểm tra nút Refresh trên Home và 5 service ở 320/390/430px: vùng chạm vuông ít nhất 44×44px và icon nằm giữa nút.
