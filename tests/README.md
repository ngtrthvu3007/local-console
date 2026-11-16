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
```

- Console ở cổng khác: `LOCAL_CONSOLE_URL=http://localhost:3702 npm run test:it -w tests`
- Báo cáo lần test gần nhất: [REPORT.md](REPORT.md)
- Ảnh (`results/screens/`, `results/ux/`) và báo cáo HTML (`results/report/`) được commit; trace và ảnh lúc fail (`results/playwright/`) thì không
- Test tạo resource có tiền tố `lc-it-` / `lc-e2e-` và tự xoá khi chạy xong
