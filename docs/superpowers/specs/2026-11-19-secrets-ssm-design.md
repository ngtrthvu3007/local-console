# Secrets Manager + SSM Parameter Store — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: đã duyệt (2026-11-19) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đưa lên từ "Để sau"

## 1. Mục tiêu

Làm màn hình **Secrets Manager** và **Parameter Store** (Systems Manager) cho cấu hình mà app và Lambda đọc khi chạy local. Dev dùng để:

- Seed, xem, sửa secret / parameter mà app hoặc IaC đã tạo trên Floci, để test app với giá trị khác nhau.
- Test Lambda rotation secret ở local (Floci gọi Lambda thật).
- Biết secret / parameter nào do stack CloudFormation tạo.

Hai service là **hai mục riêng trên console** (giống AWS: Secrets Manager và Systems Manager › Parameter Store), chung một spec vì cùng là "cấu hình cho app". Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

Đối chiếu tài liệu Floci và đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác (tiêu chí quan trọng), **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Chỉ tính năng thường dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Service         | Tính năng                                                                           | Tiêu chí               | Floci 2.4.0                                                                |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| Secrets Manager | Danh sách, tìm theo tên                                                             | (1)                    | Toàn phần                                                                  |
| Secrets Manager | Tạo secret: plaintext hoặc key / value                                              | (1)                    | Toàn phần                                                                  |
| Secrets Manager | Chi tiết: **Retrieve secret value** (bấm mới hiện), sửa giá trị, sửa mô tả          | (1)                    | Toàn phần                                                                  |
| Secrets Manager | **Rotation**: xem cấu hình, sửa (Lambda + lịch), tắt, **Rotate secret immediately** | (2) Lambda (user chốt) | Toàn phần: gọi Lambda thật 4 bước, lịch tự chạy (7 #3–#4)                  |
| Secrets Manager | Xóa (recovery window như AWS)                                                       | (1)                    | Toàn phần                                                                  |
| Parameter Store | Danh sách, tìm theo tên / path                                                      | (1)                    | Toàn phần                                                                  |
| Parameter Store | Tạo / sửa: String, StringList, SecureString                                         | (1)                    | Toàn phần                                                                  |
| Parameter Store | Chi tiết: giá trị, **SecureString che mặc định** (nút Show)                         | (1)                    | Một phần: Floci trả SecureString dạng rõ, console tự che (7 #7)            |
| Parameter Store | Xóa (chọn nhiều)                                                                    | (1)                    | Toàn phần                                                                  |
| Chung           | `StackLink` cho secret / parameter do stack tạo                                     | (2)                    | Toàn phần ([spec CloudFormation](2026-11-19-cloudformation-design.md) 3.8) |

### Để sau

| Tính năng                                             | Ghi chú                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Bảng versions + stage của secret                      | Đoán dev ít xem; Floci gắn cả `AWSPENDING` lẫn `AWSCURRENT` sau rotation (7 #5) |
| Hủy xóa secret (restore)                              | Đoán ít dùng                                                                    |
| Tab History của parameter, label version              | Đoán ít dùng                                                                    |
| Tag, resource policy, replication, binary secret      | Đoán ít dùng                                                                    |
| Parameter policy, tier Advanced / Intelligent-Tiering | Floci chỉ lưu policy, không chạy (7 #8)                                         |

### Không làm

| Tính năng                                  | Lý do                                     |
| ------------------------------------------ | ----------------------------------------- |
| Run Command, Documents, Associations (SSM) | Ngoài Parameter Store                     |
| Xóa ngay không recovery window (secret)    | AWS Console không có (chỉ CLI); giống AWS |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm (Cloudscape, mỗi vùng một nút chính, "—" khi thiếu, bảng hai tầng khi hẹp, giữ khung khi rỗng / lỗi). Tên secret / parameter có thể có `/` → đưa vào query string (`?name=`), giống `?key=` của S3.

Sidebar Secrets Manager: **Secrets**. Sidebar Systems Manager: **Parameter Store**.

### 3.1 Danh sách secret — `/secretsmanager/secrets`

```text
Secrets (3)                                         [↻] [Delete] [Store a new secret]
[🔍 Find secrets by name     ]
 ◯ Secret name ▲            Description          Last changed       Rotation
 ◯ app/db                   DB credentials       2026-11-19 09:12   ● Enabled
 ◯ rds!db-1a2b…             —                    2026-11-19 08:40   —
 ◯ stripe-key               —                    2026-11-19 08:01   —
```

- `ListSecrets` (filter `name`, vòng `NextToken`). Secret đang chờ xóa không hiện (giống AWS mặc định).
- Delete: chọn một → modal 3.4.

### 3.2 Tạo secret — `/secretsmanager/secrets/create`

| Trường      | Ghi chú                                                  |
| ----------- | -------------------------------------------------------- |
| Secret type | `Tiles`: Key/value / Plaintext. Mặc định Key/value       |
| Key/value   | Bảng Key / Value; thêm, xóa dòng → lưu thành JSON object |
| Plaintext   | `CodeEditor` (text)                                      |
| Name        | 1–512 ký tự: chữ, số, `/_+=.@-`                          |
| Description | Tùy chọn                                                 |

`CreateSecret` (`SecretString`). Trùng tên: lỗi gốc `ResourceExistsException`. Tạo xong mở chi tiết.

### 3.3 Chi tiết secret — `/secretsmanager/secrets/detail?name=`

```text
app/db                                                          [Delete]
Stack: AppStack ↗
┌ Secret details ─────────────────────────────────────────────────────────┐
│ ARN  arn:aws:secretsmanager:…:secret:app/db-AbC123 ⧉   Description  DB credentials [Edit] │
└─────────────────────────────────────────────────────────────────────────┘
┌ Secret value ──────────────────────────────── [Retrieve secret value] ┐
│ (ẩn) → sau khi bấm:  [Key/value] [Plaintext]               [Edit]      │
│   username   app                                                       │
│   password   ••••••  (hiện đủ, như AWS sau khi Retrieve)               │
└────────────────────────────────────────────────────────────────────────┘
┌ Rotation ──────────────────────── [Edit rotation] [Rotate secret immediately] ┐
│ Status        ● Enabled                                                       │
│ Lambda        rotate-db-secret ↗                                              │
│ Schedule      rate(30 days) · Last rotated 2026-11-19 09:00 · Next 2026-12-19 │
└───────────────────────────────────────────────────────────────────────────────┘
```

- `DescribeSecret`: ARN, description, `LastChangedDate`, `RotationEnabled`, `RotationLambdaARN`, `RotationRules`, `LastRotatedDate`, `NextRotationDate`.
- **Secret value:** chỉ gọi `GetSecretValue` khi bấm **Retrieve secret value** (giống AWS). Tab **Key/value** chỉ có khi giá trị là JSON object **phẳng, mọi value là string**; còn lại (số, boolean, object lồng, `null`, không phải JSON) chỉ có **Plaintext**, để lưu lại không đổi kiểu dữ liệu app đang đọc. Secret binary (`SecretBinary`): hiện "Binary secret — not shown", không sửa.
- **Edit value:** đúng tab đang xem (Key/value hoặc Plaintext) → `PutSecretValue`. Plaintext lưu nguyên văn, không format lại.
- **Edit description:** modal → `UpdateSecret` (`Description`).
- **Rotation:**
  - **Edit rotation** (modal): `Toggle` Automatic rotation; Lambda (`Select` từ `useFunctions` của Lambda); Schedule (`Tiles`: Days `rate(N days)` / Expression `cron(...)` hoặc `rate(...)`). Lưu → `RotateSecret` (`RotationLambdaARN`, `RotationRules.ScheduleExpression`, `RotateImmediately: false`). Tắt toggle → `CancelRotateSecret`.
  - **Rotate secret immediately** (chỉ bật khi đã có Lambda) → `RotateSecret` không tham số. Floci trả về ngay và chạy 4 bước **ở nền** (7 #12): lỗi của Lambda không về tới console. Thông báo: "Rotation started in the background. Refresh to see the new value; if it doesn't change, check the Lambda's logs." kèm link log Lambda. Không tự polling.
  - Lambda link sang `lambdaRoutes.function(tên, "monitor")` để xem log rotation.
- Secret không tồn tại: "Secret … not found" kèm link về danh sách.

### 3.4 Xóa secret (modal)

Giống AWS: chọn recovery window 7–30 ngày (mặc định 7), gõ `delete` → `DeleteSecret` (`RecoveryWindowInDays`). Mô tả: "The secret is hidden and can't be read until the window ends. Creating a secret with the same name fails until then." (7 #2).

### 3.5 Danh sách parameter — `/ssm/parameters`

```text
Parameters (4)                                       [↻] [Delete] [Create parameter]
[🔍 Find parameters by name or path   ]
 ☐ Name ▲                         Type           Version   Last modified
 ☐ /app/dev/db-host               String               2   2026-11-19 09:12
 ☐ /app/dev/db-password           SecureString         1   2026-11-19 09:12
 ☐ /app/dev/feature-flags         StringList           3   2026-11-19 08:40
 ☐ /cdk-bootstrap/hnb659fds/version  String            1   2026-11-19 08:01
```

- `DescribeParameters` (vòng `NextToken`); ô tìm → `ParameterFilters` `Name` `Contains`.
- Delete (chọn nhiều): `ConfirmModal` gõ `delete` → `DeleteParameters` (từng lô 10, luật của API).

### 3.6 Tạo / sửa parameter — `/ssm/parameters/create`, `/ssm/parameters/edit?name=`

| Trường      | Ghi chú                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| Name        | Khóa khi sửa. Ký tự `a-zA-Z0-9_.-/`; bắt đầu bằng `/` nếu có nhiều cấp                   |
| Description | Tùy chọn                                                                                 |
| Type        | `Tiles`: String / StringList / SecureString. StringList: giá trị cách nhau bằng dấu phẩy |
| Value       | `Textarea`. SecureString: ô dạng password                                                |

`PutParameter` (`Overwrite: true` khi sửa). Tier Standard (mặc định của AWS).

### 3.7 Chi tiết parameter — `/ssm/parameters/detail?name=`

```text
/app/dev/db-password                                     [Delete] [Edit]
Stack: AppStack ↗
 Type          SecureString
 Version       1 · Last modified 2026-11-19 09:12
 Value         ••••••••  [Show]
 Description   —
 ARN           arn:aws:ssm:…:parameter/app/dev/db-password ⧉
```

- `GetParameter` (`WithDecryption: true`) + `DescribeParameters` (mô tả).
- **SecureString:** giá trị che mặc định, **Show** mới hiện (console tự che vì Floci trả dạng rõ, 7 #7). String / StringList hiện luôn.

### 3.8 StackLink

| Trang              | Type                          | Physical ID truyền vào |
| ------------------ | ----------------------------- | ---------------------- |
| Chi tiết secret    | `AWS::SecretsManager::Secret` | ARN (kiểm khi làm)     |
| Chi tiết parameter | `AWS::SSM::Parameter`         | tên                    |

Service nào vào `main` sau thì làm phần này (cùng quy tắc với các service khác trong spec CloudFormation 3.8): thêm `StackLink` vào hai trang chi tiết và thêm hai type vào `resourceLinks.ts`: secret → `/secretsmanager/secrets/detail?name=<tên>` (tên lấy từ ARN, bỏ hậu tố 6 ký tự), parameter → `/ssm/parameters/detail?name=<tên>`.

- Export một hàm route dùng chung `secretsRoutes.secretOfArn(arn)` (ARN → `/secretsmanager/secrets/detail?name=<tên>`, bỏ hậu tố 6 ký tự) để CloudFormation (`resourceLinks.ts`) và RDS (link secret `rds!…`) dùng chung.
- RDS › Configuration: link secret `rds!…` sang chi tiết secret bằng hàm trên ([spec RDS](2026-11-19-rds-design.md) 3.2). Service nào vào `main` sau thì làm.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                  | Gọi                                                                |
| ------------------------- | ------------------------------------------------------------------ |
| Danh sách secret          | `ListSecrets`                                                      |
| Chi tiết / giá trị        | `DescribeSecret`; `GetSecretValue` khi bấm Retrieve                |
| Sửa giá trị / mô tả       | `PutSecretValue` / `UpdateSecret`                                  |
| Rotation                  | `RotateSecret` (cấu hình, rotate ngay), `CancelRotateSecret` (tắt) |
| Xóa secret                | `DeleteSecret` (`RecoveryWindowInDays`)                            |
| Danh sách parameter       | `DescribeParameters`                                               |
| Chi tiết parameter        | `GetParameter` (`WithDecryption`) + `DescribeParameters`           |
| Tạo / sửa / xóa parameter | `PutParameter` / `DeleteParameters`                                |

---

## 5. Trạng thái và lỗi

| Tình huống                               | Hiển thị                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Secret / parameter không có              | "… not found" kèm link về danh sách                                                            |
| Tạo trùng tên                            | Lỗi gốc (`ResourceExistsException`, `ParameterAlreadyExists`)                                  |
| Tạo secret trùng tên secret đang chờ xóa | Lỗi gốc; mô tả ở modal xóa (3.4)                                                               |
| Rotation Lambda không gọi được           | Lỗi gốc (`AccessDeniedException … cannot invoke`)                                              |
| Rotation Lambda lỗi giữa chừng           | Không báo về console (Floci chạy nền, 7 #12); thông báo sau khi bấm Rotate nhắc xem log Lambda |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-secrets-manager @aws-sdk/client-ssm -w web --min-release-age=7
```

`tests/` khi viết integration test: cùng lệnh với `-w tests`.

### Cấu trúc thư mục

```bash
web/src/services/secretsmanager/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── secretValue.ts             # JSON object ↔ bảng key/value
├── hooks/                     # useSecretsManager (client), useSecrets (list, detail, value, put, update, rotate, cancel, delete)
├── pages/                     # SecretList, CreateSecret, SecretDetail
└── components/                # SecretValue, RotationSection, EditRotationModal, DeleteSecretModal

web/src/services/ssm/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── hooks/                     # useSSM (client), useParameters (list, detail, put, delete)
├── pages/                     # ParameterList, ParameterForm, ParameterDetail
└── components/                # ParameterValue (che SecureString)
```

Hai dòng trong `registry.ts`; icon `secretsmanager.svg`, `ssm.svg`.

### Dùng lại từ phần đã có

| Thành phần                                                                            | Dùng cho                       |
| ------------------------------------------------------------------------------------- | ------------------------------ |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `FormModal`, `FormFields`, `useZodForm` | Bảng, form, modal              |
| `CodeEditor`, `CopyButton`                                                            | Plaintext secret, ARN          |
| `useFunctions`, `lambdaRoutes` (Lambda)                                               | Chọn Lambda rotation, link log |
| `StackLink` (CloudFormation)                                                          | Chi tiết secret / parameter    |
| `EmptyState`, `emptyOrError`, `NotFound`, `useIsCompact`, `useNotify`                 | Trạng thái, thông báo          |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-19, region `ap-southeast-1`. Resource tạm đã xóa, kiểm còn 0.

| #   | Rủi ro                            | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **CRUD secret**                   | **Ổn.** Create (string / JSON / binary), Get (stage, version, ARN đủ hoặc thiếu hậu tố), Put, Update, Describe, List (filter, phân trang). ARN có hậu tố 6 ký tự như AWS                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | **Xóa / restore**                 | Recovery window 7 ngày: secret ẩn khỏi list, `GetSecretValue` → `InvalidRequestException … marked for deletion`; restore đọc lại được; `ForceDeleteWithoutRecovery` biến mất ngay                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3   | **`RotateSecret` với Lambda**     | **Ổn.** Gọi Lambda thật đủ 4 bước theo thứ tự; giá trị mới thành `AWSCURRENT`. Lambda không có → `AccessDeniedException`. `RotateImmediately=false` chỉ gọi bước `testSecret` (lệch AWS, đúng tài liệu Floci). `CancelRotateSecret` → tắt                                                                                                                                                                                                                                                                                                                                                           |
| 4   | **Rotation theo lịch**            | **Tự chạy:** `cron` 2 phút sau → tự xoay, `LastRotatedDate` cập nhật, `NextRotationDate` sang lần sau                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | **Stage sau rotation**            | Version mới mang cả `AWSPENDING` và `AWSCURRENT` (AWS gỡ `AWSPENDING`). Version cũ không còn label bị bỏ ngay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6   | **CRUD parameter**                | **Ổn.** Put (String, StringList, SecureString, tier, overwrite), Get, GetByPath (recursive, phân trang), Describe (filter), History, Label, Tag, Delete / DeleteParameters                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | **SecureString**                  | `GetParameter` **không** `WithDecryption` vẫn trả dạng rõ (AWS trả ciphertext) → console tự che                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | **Giới hạn**                      | Policy trên tier Standard, giá trị > 4 KB đều được nhận (AWS từ chối). Expiration policy chỉ lưu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | **Lambda đọc secret / parameter** | **Ổn.** Floci inject `AWS_ENDPOINT_URL` vào Lambda; SDK có sẵn trong runtime đọc được                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10  | **CloudFormation**                | `AWS::SecretsManager::Secret` (+ `GenerateSecretString`, `Ref` = ARN) và `AWS::SSM::Parameter` tạo thật; `{{resolve:secretsmanager:…}}`, `{{resolve:ssm:…}}` resolve thật                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 11  | **RDS**                           | Secret `rds!…` do RDS (`ManageMasterUserPassword`) tạo hiện trong `ListSecrets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 12  | **Rotation chạy nền**             | `RotateSecret` (cả lưu cấu hình với `RotateImmediately: false` lẫn rotate ngay) trả 200 ngay (0 s), cấu hình được lưu; Floci gọi Lambda ở nền. Lambda lỗi chỉ thấy trong log Lambda / log Floci. Khi lưu với `false`, Floci vẫn gọi `testSecret` ở nền (Lambda theo template AWS sẽ lỗi vì chưa có `AWSPENDING`, nhưng không ảnh hưởng cấu hình đã lưu). Lambda viết theo template AWS (createSecret → `PutSecretValue` `AWSPENDING`): lần kiểm 2026-11-19 bước testSecret báo không thấy `AWSPENDING`, giá trị không đổi — **kiểm lại khi làm** (lần khảo sát trước, Lambda khác, xoay thành công) |

**Chưa kiểm, kiểm khi làm:** SDK v3 qua proxy `/aws` (JSON 1.1 như DynamoDB); physical ID của `AWS::SecretsManager::Secret` là ARN đầy đủ (`Ref` trả ARN).

---

## 8. Thứ tự làm

1. User cài package (mục 6). Icon, hai dòng trong `registry.ts`, client.
2. Hàm thuần + unit test: `secretValue.ts`.
3. Secrets Manager: danh sách, tạo, chi tiết (retrieve, sửa giá trị / mô tả), xóa.
4. Rotation: section, Edit rotation, Rotate immediately, tắt.
5. Parameter Store: danh sách, tạo / sửa, chi tiết (che SecureString), xóa nhiều.
6. `StackLink` (khi CloudFormation đã vào `main`) và hai dòng trong `resourceLinks.ts`.
7. Test: integration `tests/it/secrets-ssm.test.ts` (CRUD, rotation với Lambda thật, SecureString); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; secret / parameter `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs` (secret xóa bằng `ForceDeleteWithoutRecovery` trong dọn dẹp test).

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: tạo secret key/value → retrieve thấy đúng → sửa giá trị → Lambda đọc thấy giá trị mới → tạo Lambda rotation → Edit rotation chọn Lambda, `rate(1 day)` → Rotate immediately → giá trị đổi, Last rotated cập nhật, log Lambda có 4 bước → tạo parameter String và SecureString → SecureString che, Show hiện → sửa → xóa nhiều → stack CDK có secret / parameter → chi tiết thấy "Stack: …".

---

## 9. Quyết định

| Quyết định                                                                 | Lý do                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Đưa Secrets Manager + SSM lên từ "Để sau", chung một spec                  | Công nhỏ, Floci hỗ trợ gần đủ, nối Lambda / CloudFormation / RDS. User chốt 2026-11-19                       |
| Hai mục riêng trên console                                                 | Giống AWS                                                                                                    |
| Làm rotation                                                               | Nối Lambda, Floci chạy thật, công nhỏ. User chốt 2026-11-19                                                  |
| Versions, restore, history, tag, policy, replication để sau                | Theo 3 tiêu chí; user chốt 2026-11-19                                                                        |
| Xóa secret có recovery window, không có xóa ngay                           | Giống AWS Console                                                                                            |
| Giá trị secret chỉ lấy khi bấm Retrieve; SecureString che mặc định         | Giống AWS; Floci trả SecureString dạng rõ                                                                    |
| Tên secret / parameter đưa vào query string (`?name=`)                     | Tên có `/`; giống `?key=` của S3. User duyệt 2026-11-19                                                      |
| Edit rotation lưu với `RotateImmediately: false`; xoay ngay bằng nút riêng | Giống AWS; Floci chỉ chạy `testSecret` khi `false` nên không đổi giá trị ngoài ý muốn. User duyệt 2026-11-19 |
| Không sửa server                                                           | Hai service là AWS API thuần, đi qua proxy `/aws`                                                            |
