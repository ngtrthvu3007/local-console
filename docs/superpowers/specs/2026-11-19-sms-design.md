# SNS Text messaging (SMS) — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã duyệt (2026-11-19) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · Mở rộng [SNS](2026-11-18-sns-design.md), làm sau khi SNS vào `main`

## 1. Mục tiêu

Trang **Text messaging (SMS)** trong SNS: **hộp thư SMS local**. Floci không gửi SMS thật mà lưu lại mọi tin. Dev dùng để:

- Xem SMS app đã gửi (OTP, thông báo) và kiểm nội dung đúng chưa, với số điện thoại giả.
- Xem SMS mà Cognito gửi (thư mời có mật khẩu tạm, mã xác minh số điện thoại, MFA) — Cognito link sang đây.
- Gửi thử một SMS (giống nút "Publish text message" của AWS).

User chốt 2026-11-19: SMS làm trong spec riêng này; dùng số giả là đủ (chỉ cần kiểm nội dung). Làm cùng kiểu với hộp thư của SES ([spec SES](2026-11-17-ses-design.md) 3.1). Mọi thao tác gọi Floci qua proxy `/aws`. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng, **hoặc** (2) nối với service khác, **và** (3) Floci hỗ trợ. Chỉ tính năng hay dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm                 | Tính năng                                                                           | Tiêu chí    | Floci 2.4.0                              |
| -------------------- | ----------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| Hộp thư SMS          | Danh sách SMS của region (số, nội dung, giờ), mới nhất trên; tìm theo số / nội dung | (1)         | Toàn phần (`GET /_aws/sns`, 7 #1)        |
| Lọc theo số qua URL  | `?phone=` điền sẵn ô tìm                                                            | (2) Cognito | Toàn phần                                |
| Tự làm mới           | Toggle Auto refresh (5 s)                                                           | (1)         | Toàn phần                                |
| Xóa                  | Delete (đã chọn), Delete all (cả region)                                            | (1)         | Toàn phần (`DELETE /_aws/sns?id=`, 7 #2) |
| Publish text message | Số điện thoại, nội dung, loại (Transactional / Promotional)                         | (1)         | Toàn phần (tin vào hộp thư, 7 #3)        |

### Không làm

| Tính năng                                                            | Lý do                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Sandbox destination phone numbers, origination numbers, sender ID    | Ở local không gửi thật; Floci trả dữ liệu giả (7 #5)          |
| Text messaging preferences (spend limit, default type, delivery log) | Như trên                                                      |
| Opted-out phone numbers                                              | Như trên                                                      |
| SMS qua subscription `sms` của topic                                 | Floci không giao (7 #4); SNS spec cũng không làm protocol SMS |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar SNS thêm mục **Text messaging (SMS)** (giống vị trí trong AWS Console: SNS › Mobile › Text messaging).

### 3.1 Hộp thư SMS — `/sns/sms`

```text
Text messages (3)          Auto refresh [○]  [↻] [Delete] [Delete all] [Publish text message]
SMS your app sent through SNS (and Cognito) in ap-southeast-1. Nothing is delivered.
[🔍 Find by phone number or message     ]
 ☐ Phone number      Message                                              Sent
 ☐ +84900000111      Your verification code is 123456                     10:20:01
 ☐ +84900000222      Your username is ab12… and temporary password is …   10:18:44
```

- Đọc `GET /_aws/sns` (trả `{ messages: [...] }`), **lọc theo region của console** (mỗi tin có `Region`), sắp mới nhất trên bằng `Date.parse(Timestamp)` (timestamp có tới 9 chữ số lẻ, không so chuỗi). Giống hộp thư SES.
- Ô tìm lọc phía trình duyệt theo số điện thoại và nội dung. `?phone=` trên URL điền sẵn ô tìm (link **View SMS** của [Cognito](2026-11-19-cognito-design.md) dùng).
- Cột Message hiện **đầy đủ** (`white-space: pre-wrap`, xuống dòng); SMS ngắn nên không cần panel xem riêng. `Subject` (nếu có) hiện mờ phía trên nội dung.
- **Auto refresh** (`Toggle`): tải lại mỗi 5 giây. Mặc định tắt.
- **Delete** (đã chọn), **Delete all** (mọi tin của region này): gõ `delete` để xác nhận. Xóa **từng tin theo ID** (`DELETE /_aws/sns?id=`), không gọi `DELETE /_aws/sns` (xóa cả region khác) — giống SES.
- Khung hẹp: tầng 1 là nội dung + giờ, tầng 2 là số điện thoại.
- Rỗng: "No text messages yet. SMS your app sends through SNS shows up here."

### 3.2 Publish text message (modal)

| Trường       | Ghi chú                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| Phone number | Bắt buộc, dạng E.164 (`+84…`). Mô tả: "Floci doesn't send real SMS. Any number works." |
| Message      | Bắt buộc, `Textarea`                                                                   |
| Message type | `Tiles`: Transactional / Promotional. Mặc định Transactional                           |

`Publish` (`PhoneNumber`, `Message`, `MessageAttributes` `AWS.SNS.SMS.SMSType`). Gửi xong làm mới hộp thư, thông báo kèm Message ID.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác             | Gọi                                                       |
| -------------------- | --------------------------------------------------------- |
| Hộp thư              | `GET /aws/_aws/sns` → lọc `Region` → sắp theo `Timestamp` |
| Xóa                  | `DELETE /aws/_aws/sns?id=<id>` từng tin                   |
| Publish text message | SNS `Publish` (`PhoneNumber`)                             |

---

## 5. Trạng thái và lỗi

| Tình huống                  | Hiển thị                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chưa có tin                 | Empty state (3.1)                                                                                                                 |
| Số điện thoại sai định dạng | Chặn ở form (E.164)                                                                                                               |
| Xóa nhiều tin, có tin lỗi   | Báo kết quả gộp (dùng lại `notifyBulkOutcome` như SES)                                                                            |
| App gửi SMS qua topic       | Không có trong hộp thư (Floci không giao, 7 #4); mô tả ở header trang: "SMS sent to topic subscriptions isn't captured by Floci." |

---

## 6. Kỹ thuật

### Package

Không cần cài: `@aws-sdk/client-sns` có sẵn từ SNS.

### Cấu trúc thư mục

```bash
web/src/services/sns/
├── smsInbox.ts                # gọi /_aws/sns, lọc region, sắp theo thời gian (giống mailbox.ts của SES)
├── hooks/useSms.ts            # inbox, xóa, publish
├── pages/SmsInbox.tsx
└── components/PublishSmsModal.tsx
```

Thêm route `/sns/sms` và mục **Text messaging (SMS)** vào `navigation` của SNS trong `registry.ts`.

### Dùng lại từ phần đã có

| Thành phần                                                                            | Dùng cho              |
| ------------------------------------------------------------------------------------- | --------------------- |
| Cách làm hộp thư SES (lọc region, sắp `Date.parse`, xóa từng ID, `notifyBulkOutcome`) | Hộp thư SMS           |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `useZodForm`               | Bảng, modal           |
| `EmptyState`, `emptyOrError`, `useIsCompact`, `useNotify`, `formatDate`               | Trạng thái, thông báo |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`. Tin thử đã xóa.

| #   | Rủi ro                   | Kết quả                                                                                                                                   |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hộp thư**              | `GET /_aws/sns` → `{ messages: [{ Id, Region, PhoneNumber, Message, Subject, Timestamp }] }`. Không cần header `Authorization`            |
| 2   | **Xóa**                  | `DELETE /_aws/sns?id=<id>` → 200                                                                                                          |
| 3   | **Publish thẳng tới số** | **Ổn.** `Publish` với `PhoneNumber` → tin có trong hộp thư (`Subject: null`)                                                              |
| 4   | **Publish qua topic**    | Topic có subscription `sms` → `Publish` trả Message ID nhưng **không** có tin trong hộp thư                                               |
| 5   | **Cấu hình SMS**         | `SetSMSAttributes`, `ListPhoneNumbersOptedOut`, `CheckIfPhoneNumberIsOptedOut`, `GetSMSSandboxAccountStatus` trả lời nhưng là dữ liệu giả |
| 6   | **Cognito**              | Thư mời qua SMS (`DesiredDeliveryMediums: SMS`) vào hộp thư (khảo sát Cognito)                                                            |

**Chưa kiểm, kiểm khi làm:** SDK v3 `Publish` với `PhoneNumber` qua proxy `/aws`; hộp thư có giới hạn số tin không.

---

## 8. Thứ tự làm

0. **Làm sau khi SNS vào `main`.**
1. Hàm thuần + unit test: `smsInbox.ts` (lọc region, sắp theo `Timestamp` 9 chữ số lẻ).
2. Trang hộp thư: danh sách, tìm, `?phone=`, auto refresh, xóa.
3. Publish text message.
4. Bật link **View SMS** ở chi tiết user Cognito (nếu Cognito đã vào `main`; service nào vào sau thì làm).
5. Test: integration `tests/it/sms.test.ts` (publish tới số → có trong hộp thư → xóa); E2E một luồng chính; trang vào `tests/ui/responsive.spec.ts`; dọn tin `+8490000…` thử trong `tests/it/leftovers.mjs`.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: Publish text message tới số giả → thấy trong hộp thư → app gửi OTP bằng SNS `Publish` → bật Auto refresh thấy tin mới → Cognito tạo user gửi thư mời SMS → View SMS từ Cognito mở hộp thư lọc đúng số → Delete, Delete all.

---

## 9. Quyết định

| Quyết định                                             | Lý do                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| SMS là spec riêng, trang nằm trong SNS                 | User chốt 2026-11-19; giống vị trí trong AWS Console          |
| Dùng số giả, chỉ kiểm nội dung                         | User chốt 2026-11-19                                          |
| Làm cùng kiểu hộp thư SES (lọc region, xóa từng ID)    | Hộp thư Floci dùng chung mọi region                           |
| Không có sandbox, preferences, origination, opted-out  | Ở local không gửi thật; Floci trả dữ liệu giả                 |
| Có Publish text message                                | AWS Console có; gửi thử nội dung nhanh. User duyệt 2026-11-19 |
| Nội dung SMS hiện thẳng trong bảng, không có panel xem | SMS ngắn, chỉ là text. User duyệt 2026-11-19                  |
| Không sửa server                                       | `/_aws/sns` đi qua proxy `/aws`                               |
