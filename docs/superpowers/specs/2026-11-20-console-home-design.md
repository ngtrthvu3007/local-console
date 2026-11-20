# Console Home mới + ô search service — Thiết kế

> Ngày: 2026-11-20 · Trạng thái: đã duyệt (2026-11-20) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · Thay bảng Services trên Home bằng thẻ Recently visited

## 1. Mục tiêu

Bảng Services trên Home làm lúc còn ít service; roadmap sẽ lên ~17 service, bảng một dòng mỗi service quá dài. Home mới phục vụ nhiều kiểu người dùng, mỗi kiểu một thứ:

| Người dùng                 | Cần                                     |
| -------------------------- | --------------------------------------- |
| Quen tìm kiếm rồi nhảy vào | Ô search trên thanh trên cùng, phím `/` |
| Người mới vào team         | Sidebar chia nhóm; thẻ Connect your app |
| Người quay lại làm tiếp    | Service mở gần đây (Home và ô search)   |

**Không làm:** tìm theo tên resource hay tên trang con (user chốt 2026-11-20: chỉ tên service); feed hoạt động ("mail mới", "message mới"): phải quét mọi service liên tục.

## 2. Cách đã cân nhắc

| Cách                                                              | Đánh đổi                                         |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| **Như AWS: thẻ Recently visited + thẻ thông tin + search (chốt)** | Gọn, quen mắt; xem đủ service ở sidebar / search |
| Lưới thẻ chia nhóm + recent + search (đã làm thử, bỏ)             | Nhìn rời rạc: nhóm 1 service để trống cả hàng    |
| Giữ bảng, gom nhóm + ô lọc trên Home                              | Sửa ít nhất, vẫn dài 17 dòng                     |

## 3. Màn hình

> **Đổi 2026-11-20 (user chốt sau khi xem bản lưới thẻ):** lưới thẻ chia nhóm nhìn rời rạc (nhóm 1 service để trống cả hàng, thẻ cao thấp khác nhau). Làm như AWS Console Home: **một thẻ Recently visited + các thẻ thông tin**. Bỏ lưới service và số resource; danh sách đủ service nằm ở sidebar và ô search. Thẻ Connect your app đổi sang ô terminal giống trang Floci tắt.

```text
[logo] Local Console   [ 🔍 Search services [/] ]        Floci · Running   Region   Appearance

Console Home                                                     [↻]
Floci 2.4.0 at localhost:4566 · checked 10:02

┌ Recently visited ─────────────────────────────┐ ┌ Floci ───────────┐
│ [▤] Amazon DynamoDB     [@] Amazon SES         │ │ Status  Running  │
│ [λ] AWS Lambda          [▣] Amazon S3          │ │ Version 2.4.0    │
└────────────────────────────────────────────────┘ │ …                │
┌ Connect your app ─────────────────────────────┐ └──────────────────┘
│ On host | In Docker                            │
│ ┌──────────────────────────────────────── ⧉ ┐  │
│ │ AWS_ENDPOINT_URL=http://localhost:4566     │  │
│ │ …                                          │  │
│ └────────────────────────────────────────────┘  │
│ For apps started with npm, go run…              │
└────────────────────────────────────────────────┘
```

### 3.1 Ô search (thanh trên cùng, mọi trang)

- `Autosuggest` trong slot `search` của `TopNavigation`. Khớp `name`, `fullName` của service trong registry (không gọi API).
- Chưa gõ: nhóm **Recently visited** trước, rồi **All services**. Đang gõ: lọc trong cả hai nhóm.
- Chọn (chuột / Enter trên mục đang sáng) → mở service, xóa ô. Enter khi không có mục sáng → mở kết quả khớp đầu tiên; ô trống hoặc không khớp thì không làm gì.
- Phím `/` ở bất kỳ đâu (trừ khi đang gõ trong input / textarea / editor) → focus ô search.
- Điện thoại: Cloudscape tự thu ô search thành nút kính lúp.

### 3.2 Thẻ Recently visited

- Ghi khi pathname đổi sang trang của một service (đoạn đầu đường dẫn = `service.id`). Mới nhất lên đầu, không trùng, tối đa 4.
- Lưu `localStorage` (try/catch); service đã gỡ khỏi registry thì bỏ qua.
- Thẻ: icon + `fullName` (link), 2 cột (điện thoại 1 cột). Chưa có lịch sử: "No recently visited services · Open a service from the menu, or press / to search."

### 3.3 Thẻ thông tin

- **Connect your app:** tab On host / In Docker; biến môi trường trong ô terminal dùng chung với trang Floci / server tắt (`TerminalBlock`: nền tối, chữ mono, nút copy dạng icon). Dòng giữ nguyên, dài thì cuộn trong khung (URL không bị gãy giữa chừng).
- **Floci:** giữ như cũ.
- Desktop: cột trái 8/12 (Recently visited, Connect your app), cột phải 4/12 (Floci). Điện thoại: xếp dọc.

## 4. Kỹ thuật

- Không thêm package.
- File: `pages/home/RecentServices.tsx`, `pages/home/Home.tsx`, `pages/home/ConnectYourApp.tsx` (xóa `ServicesTable.tsx`, `resourceCounts.ts`); `shared/components/ServiceSearch.tsx`, `shared/components/TerminalBlock.tsx`; `shared/recentServices.ts`; `shared/Layout.tsx`; `Layout.css`; `registry.ts` + 8 `services/*/index.tsx` (bỏ `quickLinks`).
- Dùng lại: `ServiceIcon`, `useFollow`, `servicePath`, `CopyButton`.

## 5. Kiểm tra

- Unit: recent (thêm, đưa lên đầu, không trùng, giới hạn, storage hỏng / bị chặn); khớp search.
- E2E: Home chưa có lịch sử hiện hướng dẫn; mở hai service → thẻ Recently visited liệt kê mới nhất trước, bấm mở được; `/` focus search, gõ tên, Enter mở service; gõ `/` trong ô nhập của trang vẫn ra ký tự.
- Mobile / UI: sửa test đang đọc bảng Services; chụp 1440, 1024, 390px, không cuộn ngang; dark mode.

## 6. Để builder tự quyết

Khoảng cách, chữ placeholder: theo token Cloudscape và biến CSS sẵn có.
