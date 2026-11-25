# KMS — Thiết kế

> Ngày: 2026-11-25 · Trạng thái: đã làm (2026-11-25; IT `it/kms.test.ts`, E2E `kms.spec.ts`, `kms-integrations.spec.ts`, UI `ui/responsive.spec.ts`) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4

## 1. Mục tiêu

Màn hình KMS cho dev local, theo roadmap: **xem key / alias, bật / tắt key, mã hóa / giải mã thử**. Có ích khi app tự mã hóa hoặc ký bằng KMS. Floci 2.4.0 làm KMS thật (mục 7).

Dev dùng để:

- Tạo key cho app (đối xứng, ký RSA / ECC, mã hóa RSA, HMAC), đặt alias, xem key CDK tạo.
- Thử mã hóa / giải mã, ký / xác minh, HMAC ngay trên console để so với kết quả app.
- Bật / tắt, lên lịch xóa key để thử app khi key không dùng được.
- Biết secret, parameter, bucket, queue, topic, bảng, function, DB nào đang dùng key nào, và chọn key khi tạo chúng (user chốt 2026-11-25).

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.**

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19): tính năng thỏa (1) dev thường dùng, **hoặc** (2) nối với service khác, **và** (3) Floci hỗ trợ toàn phần hoặc một phần. Chỗ "(đoán)" là phỏng đoán về mức dev dùng.

### Làm trong đợt này

| Nhóm                | Tính năng                                                                                      | Tiêu chí         | Floci 2.4.0                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Danh sách           | Customer managed keys, AWS managed keys (hai mục sidebar)                                      | (1)              | Toàn phần                                                              |
| Chi tiết            | ID / ARN, trạng thái, KeySpec / KeyUsage, thuật toán, ngày tạo, mô tả, alias, key policy (xem) | (1)              | Toàn phần                                                              |
| Tạo key             | Đối xứng; RSA / ECC ký; RSA mã hóa; HMAC. Mô tả, alias tùy chọn                                | (1)              | Toàn phần                                                              |
| Alias               | Tạo, xóa, trỏ sang key khác                                                                    | (1)              | Một phần: nhận alias trùng tên (console tự chặn, 7 #4)                 |
| Trạng thái          | Bật / tắt; lên lịch xóa 7–30 ngày, hủy                                                         | (1)              | Một phần: nhận 6 / 31 ngày, hủy xong về Enabled (AWS: Disabled) (7 #5) |
| Try it              | Mã hóa / giải mã (encryption context), data key; ký / xác minh, public key; tạo / kiểm MAC     | (1) (HMAC: đoán) | Toàn phần                                                              |
| StackLink           | `AWS::KMS::Key`, `AWS::KMS::Alias` → trang key; "Stack: X" trên trang key                      | (2)              | Toàn phần                                                              |
| Nối 8 service: xem  | Trang chi tiết hiện key đang dùng, link sang KMS                                               | (2)              | Một phần: lưu ID key, **bỏ qua trạng thái key** (7 #3)                 |
| Nối 8 service: chọn | Ô chọn key trong form tạo (Lambda: modal Environment)                                          | (2) (user chốt)  | Một phần: như trên; SSM, SQS nhận cả key không tồn tại (7 #6)          |

8 service: Secrets Manager, SSM Parameter Store, S3, SQS, SNS, DynamoDB, Lambda, RDS.

### Để sau

| Tính năng                                        | Lý do                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Xoay vòng key (bật / tắt, trạng thái, xoay ngay) | (đoán) ít thử ở local; Floci không có `ListKeyRotations`                                         |
| Tag của key                                      | (đoán) ít dùng; EC2 cũng bỏ tag                                                                  |
| Trang key liệt kê "đang được dùng bởi…"          | Phải quét mọi service (trái nguyên tắc dùng thẳng dữ liệu Floci trả). Hướng ngược lại đã có link |
| Key cho CloudWatch Logs                          | Làm khi có trang CloudWatch Logs                                                                 |

### Không làm

| Tính năng                                               | Lý do                                             |
| ------------------------------------------------------- | ------------------------------------------------- |
| Sửa key policy, grant                                   | Floci không bắt buộc quyền: sửa không có tác dụng |
| Multi-region key, import key material, custom key store | Không phải tính năng hay dùng ở local             |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar (nhóm Security): **Customer managed keys**, **AWS managed keys**.

### 3.1 Customer managed keys — `/kms/keys`

```text
Customer managed keys (3)                    [↻] [Actions ▾] [Create key]
[🔍 Find keys by alias or ID                ]
 ◯ Aliases            Key ID                   Status        Key type      Key usage
 ◯ alias/orders       1234abcd-…               ● Enabled     Symmetric     Encrypt and decrypt
 ◯ alias/jwt          5678efgh-…               ○ Disabled    RSA_2048      Sign and verify
 ◯ —                  9abc0000-…               ⏱ Pending deletion (2026-12-02)  HMAC_256  Generate and verify MAC
```

- `ListKeys` (vòng `NextMarker`) → `DescribeKey` từng key để có trạng thái, loại, mô tả; `ListAliases` một lần để gắn alias. Lọc `KeyManager = CUSTOMER`. Ô tìm lọc ở client theo alias / ID.
- Local ít key (~30 kể cả AWS managed) nên `DescribeKey` từng key chấp nhận được. Gọi song song.
- **Actions** (menu chung của `ActionBar`, chọn một dòng): Enable, Disable, Schedule deletion, Cancel deletion (khóa theo trạng thái như AWS). Schedule deletion là `ConfirmModal` gõ `delete` + ô số ngày; Disable, Cancel deletion là `ConfirmModal` thường.
- Cột Status là `KeyStatus` (như `DatabaseStatus`): Enabled `success`, Disabled `stopped`, Pending deletion `pending` kèm ngày, còn lại `in-progress`.

### 3.2 AWS managed keys — `/kms/aws-keys`

Như 3.1 nhưng `KeyManager = AWS`, chỉ xem: không tạo, không actions. Floci có sẵn key `alias/aws/<service>` cho cả 8 service ở mục 1 (7 #2).

### 3.3 Chi tiết key — `/kms/keys/detail?key=<id | ARN | alias>`

```text
alias/orders (1234abcd-…)                          [↻] [Actions ▾]
● Enabled · Symmetric · Encrypt and decrypt                 Stack: AppStack ↗
[Details] [Aliases] [Key policy] [Try it]
```

- `key` nhận ID, ARN key, tên alias hoặc ARN alias: `DescribeKey` tự phân giải, nên link từ service khác dùng thẳng giá trị Floci trả (3.6). Query string vì alias có `/` (như `?name=` của Secrets Manager).
- **Details:** Key ID (copy), ARN (copy), trạng thái (Pending deletion kèm ngày xóa), KeySpec, KeyUsage, thuật toán (`EncryptionAlgorithms` / `SigningAlgorithms` / `MacAlgorithms`), Origin, ngày tạo, mô tả (sửa được: `UpdateKeyDescription`). Cuối tab là `ConnectCard` (`codeSamples.ts`, theo `KeyUsage`: Encrypt / Decrypt, Sign / Verify, GenerateMac / VerifyMac), điền alias nếu có, không thì key ID — như tab Configuration của Lambda.
- **Aliases:** `ListAliases(KeyId)`. Create alias (modal), Delete. Alias trỏ sang key khác làm ở trang chi tiết key đích (Create alias với tên đã có → `UpdateAlias`, hỏi xác nhận).
- **Key policy:** `GetKeyPolicy` (`default`), JSON chỉ xem (`CodeSnippet`). Mô tả: "Floci doesn't enforce key policies."
- **Try it:** theo `KeyUsage` (3.5). Tab mặc định Details, lưu trên URL (`?tab=`).
- Key AWS managed: không có Actions, không sửa mô tả, không tạo / xóa alias.
- Key không tồn tại: "Key … not found" kèm link về danh sách.

### 3.4 Create key — `/kms/keys/create`

| Trường      | Ghi chú                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key type    | `FormTiles` (như Type của Create secret / Create queue): Symmetric · Asymmetric · HMAC. Mặc định Symmetric                                                                |
| Key usage   | `FormRadioGroup`, chỉ Asymmetric: Sign and verify / Encrypt and decrypt                                                                                                   |
| Key spec    | Asymmetric ký: RSA_2048 / 3072 / 4096, ECC_NIST_P256 / P384 / P521; mã hóa: RSA_*; HMAC: HMAC_224 / 256 / 384 / 512. `FormSelect`, danh sách cố định trong `constants.ts` |
| Alias       | Tùy chọn. Thêm `alias/` nếu thiếu; không bắt đầu bằng `alias/aws/`; không trùng alias đã có (Floci nhận trùng)                                                            |
| Description | Tùy chọn                                                                                                                                                                  |

- Trang form như Create secret: `Form` + `Container` "Key configuration" (Header h2), nút ở `ResponsiveActions`. `CreateKey` → `CreateAlias` nếu có alias. Tạo xong mở chi tiết, flash "Created key …".

### 3.5 Try it

| KeyUsage                   | Khung                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENCRYPT_DECRYPT (đối xứng) | **Encrypt:** plaintext (UTF-8) + encryption context (key / value, tùy chọn) → ciphertext base64 (copy). **Decrypt:** ciphertext + context → plaintext. **Generate data key** (AES_256): plaintext + ciphertext base64 |
| ENCRYPT_DECRYPT (RSA)      | Encrypt / Decrypt với `RSAES_OAEP_SHA_256` / `_SHA_1` (chọn); không có context                                                                                                                                        |
| SIGN_VERIFY                | **Sign:** message (UTF-8) + thuật toán (từ `SigningAlgorithms`) → chữ ký base64. **Verify:** message + chữ ký → Valid / Invalid. **Public key:** tải PEM (`GetPublicKey` DER → PEM)                                   |
| GENERATE_VERIFY_MAC        | **Generate MAC:** message + thuật toán → MAC base64. **Verify MAC:** → Valid / Invalid                                                                                                                                |

- Bố cục như tab Test của Lambda: mỗi thao tác một `Container` (Header h2: Encrypt, Decrypt…), ô nhập là `FormField` + `Textarea`; encryption context dùng `KeyValueEditor` (chuyển từ Secrets Manager sang `shared/components`, vì giờ hai service dùng). Kết quả là `CodeSnippet` (nút copy góc phải, như mọi khối code); Valid / Invalid là `StatusIndicator`.
- Key Disabled / Pending deletion: khung vẫn hiện, lỗi của Floci hiện nguyên văn (`DisabledException`, `KMSInvalidStateException`) — đúng thứ dev muốn thấy.
- Chữ ký sai ở Verify: Floci trả `KMSInvalidSignatureException` → hiện "Invalid", không phải lỗi.
- Không lưu gì: kết quả mất khi rời tab.

### 3.6 Nối 8 service

**Xem:** dòng "KMS key" trong khối Details / Settings sẵn có của resource, là `KeyLink` (`services/kms/components/KeyLink.tsx`, như `QueueLink`, `FunctionLink`): link tới 3.3 với giá trị Floci trả (ID, ARN hoặc alias), nhãn là alias nếu giá trị là alias, không thì phần ID sau `key/`. Dò key bằng `DescribeKey` (`useKeyExists`); không có → `MissingReference` "(not found)" như các link khác. Key chờ xóa vẫn tồn tại nên không bị đánh dấu. Resource không dùng key → mặc định của service (cột "Mặc định" dưới).

**Chọn:** `KeySelect` (`services/kms/components/KeySelect.tsx`) trong form tạo: option đầu là mặc định của service, sau đó alias của key customer managed (`ListAliases`, nhãn alias, mô tả là ID), rồi key customer managed chưa có alias (ID). Cho nhập ARN tự gõ. Gửi **ARN của key** (dựng từ `TargetKeyId`: Lambda chỉ nhận ARN; các service khác nhận cả ARN).

**Bố cục trong form:** thêm một `Container` "Encryption" (Header h2) cuối form, như các khối khác của trang tạo. Trong đó `FormRadioGroup` các lựa chọn của service (như Default encryption của Create bucket), `KeySelect` chỉ hiện khi chọn lựa chọn dùng KMS. Lambda: `FormField` "Encryption key" trong modal Environment.

| Service         | Xem (field Floci trả)                                      | Chọn (form)                                                                                                                                                                                                                                 | Mặc định             |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Secrets Manager | `DescribeSecret.KmsKeyId`                                  | Create secret: `KmsKeyId`                                                                                                                                                                                                                   | `aws/secretsmanager` |
| SSM             | `DescribeParameters.KeyId` (chỉ SecureString)              | Create / Edit parameter, khi type SecureString: `KeyId`                                                                                                                                                                                     | `aws/ssm`            |
| S3 bucket       | `GetBucketEncryption` → `KMSMasterKeyID`                   | Create bucket: Default encryption SSE-S3 / SSE-KMS + key                                                                                                                                                                                    | SSE-S3               |
| S3 object       | `HeadObject.SSEKMSKeyId`                                   | Upload: Encryption Bucket default / SSE-KMS + key (`SSEKMSKeyId`)                                                                                                                                                                           | Bucket default       |
| SQS             | `KmsMasterKeyId`                                           | Create queue: Encryption SSE-SQS / SSE-KMS + key                                                                                                                                                                                            | SSE-SQS              |
| SNS             | `KmsMasterKeyId`                                           | Create topic: Encryption Off / On + key                                                                                                                                                                                                     | Off                  |
| DynamoDB        | `SSEDescription.KMSMasterKeyArn`                           | Create table: AWS owned / AWS managed (`aws/dynamodb`) / customer key                                                                                                                                                                       | AWS owned            |
| Lambda          | `KMSKeyArn`                                                | **Modal Environment** (form tạo không có biến môi trường): `KMSKeyArn`                                                                                                                                                                      | `aws/lambda`         |
| RDS             | `KmsKeyId` (lưu trữ), `MasterUserSecret.KmsKeyId` (secret) | Create database: storage key (`StorageEncrypted` + `KmsKeyId`); secret key khi Credentials management là Secrets Manager (`MasterUserSecretKmsKeyId`) Lưu trữ: Off (như hiện tại); bật thì mặc định `aws/rds`. Secret: `aws/secretsmanager` |

- Mô tả chung dưới ô chọn: "Floci records the key but doesn't stop using it when the key is disabled or deleted."
- S3 Create bucket thêm: "Floci doesn't apply the bucket's default encryption to new objects: choose a key when you upload." (7 #3).

---

## 4. Cách hoạt động của một số thao tác

| Thao tác   | Gọi                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Danh sách  | `ListKeys` + `DescribeKey` từng key + `ListAliases`                                                   |
| Chi tiết   | `DescribeKey(key)` + `ListAliases(KeyId)` + `GetKeyPolicy`                                            |
| Tạo        | `CreateKey` (+ `CreateAlias`)                                                                         |
| Alias      | `CreateAlias`, `UpdateAlias`, `DeleteAlias`                                                           |
| Bật / tắt  | `EnableKey`, `DisableKey`                                                                             |
| Xóa        | `ScheduleKeyDeletion` (7–30), `CancelKeyDeletion`                                                     |
| Try it     | `Encrypt`, `Decrypt`, `GenerateDataKey`, `Sign`, `Verify`, `GetPublicKey`, `GenerateMac`, `VerifyMac` |
| Ô chọn key | `ListAliases` + `ListKeys` (không `DescribeKey`)                                                      |
| `KeyLink`  | `DescribeKey` (dò key còn không)                                                                      |

---

## 5. Trạng thái và lỗi

| Tình huống                                        | Hiển thị                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Key không có                                      | "Key … not found" kèm link về danh sách                                                                            |
| Lên lịch xóa ngoài 7–30 ngày                      | Form chặn (Floci nhận 6, 31)                                                                                       |
| Alias trùng, thiếu `alias/`, bắt đầu `alias/aws/` | Form chặn trùng; hai lỗi sau Floci trả `InvalidAliasNameException`, hiện nguyên văn                                |
| Hủy lịch xóa                                      | Mô tả trong modal: "Floci enables the key again; AWS leaves it disabled."                                          |
| Tắt / xóa key đang được service dùng              | Mô tả trong modal: "Secrets, parameters, buckets, queues and other resources keep working with this key on Floci." |
| Thao tác crypto trên key tắt / chờ xóa            | Lỗi của Floci trong khung Try it                                                                                   |
| Ciphertext sai / context sai                      | `InvalidCiphertextException` trong khung Decrypt                                                                   |
| Key AWS managed                                   | Không có actions (Floci từ chối `DisableKey`: `AccessDeniedException`)                                             |
| Ô chọn key: ARN tự gõ không tồn tại               | Secrets Manager từ chối (lỗi hiện ở form); SSM, SQS nhận (7 #6) — không chặn thêm                                  |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-kms -w web --min-release-age=7
npm install @aws-sdk/client-kms -w tests --min-release-age=7
```

`@aws-sdk/client-kms` chỉ import trong service KMS và trong trang tải lười của 8 service (qua `KeySelect`, `KeyLink`), không import ở `shared/` hay `registry.ts` (development.md › Traps: bundle).

### Cấu trúc thư mục

```bash
web/src/services/kms/
├── index.tsx, routes.ts, constants.ts      # KEY_SPECS, PENDING_WINDOW_DAYS {min 7, max 30}, ALIAS_PREFIX
├── keys.ts                    # nhãn KeySpec / KeyUsage, alias của key, ARN từ TargetKeyId, DER → PEM
├── codeSamples.ts             # Connect card theo KeyUsage
├── hooks/                     # useKMS (client), useKeys (list, detail, actions, create), useAliases, useCrypto
├── pages/                     # KeyList (customer / AWS managed), KeyDetail, CreateKey
└── components/                # KeyStatus, KeyActions, DetailsTab, AliasesTab, PolicyTab, TryItTab, KeyLink, KeySelect
```

Một dòng trong `registry.ts`; icon glyph Tabler (vd `IconKey`). Dòng `AWS::KMS::Key`, `AWS::KMS::Alias` trong `resourceLinks.ts` của CloudFormation.

### Dùng lại

| Thành phần                                                                                        | Dùng cho                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `CopyButton`, `useZodForm`, `FormFields`            | Bảng, actions, form         |
| `CodeSnippet`                                                                                     | Key policy, ciphertext, PEM |
| `StackLink`, `pageState`, `EmptyState`, `emptyOrError`, `useIsCompact`, `useNotify`, `formatDate` | Trạng thái, thông báo       |
| `ResponsiveTable`                                                                                 | Danh sách                   |
| `FormTiles`, `FormRadioGroup`, `FormSelect`, `ResponsiveActions`                                  | Create key, khối Encryption |
| `ConnectCard`, `CodeSamples`                                                                      | Connect card của key        |
| `KeyValueEditor` (chuyển sang `shared/components`)                                                | Encryption context          |
| `MissingReference`, mẫu `QueueLink` / `FunctionLink`                                              | `KeyLink`                   |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-25, region `ap-southeast-1`, qua proxy `/aws` (ký SigV4, JSON 1.1). Key tạm đã lên lịch xóa, resource tạm đã xóa.

| #   | Rủi ro                               | Kết quả                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Crypto thật**                      | **Ổn.** Encrypt / Decrypt qua alias, Decrypt không cần KeyId; sai context → `InvalidCiphertextException`; GenerateDataKey; RSA / ECC Sign / Verify (chữ ký sửa → `KMSInvalidSignatureException`); RSA OAEP; HMAC; `GetPublicKey` (DER)                                                                                                       |
| 2   | **Key AWS managed**                  | Có sẵn 25 alias `alias/aws/*`, gồm đủ secretsmanager, ssm, s3, sqs, sns, dynamodb, lambda, rds; `KeyManager = AWS`; `DisableKey` → `AccessDeniedException`                                                                                                                                                                                   |
| 3   | **Service khác dùng key**            | Secrets (`KmsKeyId`), SSM (`KeyId`), S3 object (`SSEKMSKeyId`) và bucket (`KMSMasterKeyID`), SQS / SNS (`KmsMasterKeyId`), DynamoDB (`KMSMasterKeyArn`), Lambda (`KMSKeyArn`), RDS (`KmsKeyId`, secret) đều lưu và trả lại. **Tắt key: Secrets, SSM, S3, SQS vẫn đọc / gửi bình thường.** Mã hóa mặc định của bucket không áp cho object mới |
| 4   | **Alias**                            | Create / Update / Delete chạy; `ListAliases(KeyId)` lọc đúng. **Tạo alias trùng tên: nhận.** Thiếu `alias/` hoặc `alias/aws/` → `InvalidAliasNameException`. Alias của key chờ xóa vẫn còn                                                                                                                                                   |
| 5   | **Trạng thái, xóa**                  | Disable → Encrypt / Decrypt `DisabledException`; chờ xóa → `KMSInvalidStateException`. **Nhận 6 và 31 ngày.** `ScheduleKeyDeletion` không trả `KeyState`; `DescribeKey` có `DeletionDate`, không có `PendingDeletionWindowInDays`. **Cancel → Enabled**                                                                                      |
| 6   | **Key không tồn tại ở service khác** | Secrets Manager → `InvalidParameterException`; **SSM, SQS nhận**                                                                                                                                                                                                                                                                             |
| 7   | **CloudFormation**                   | `AWS::KMS::Key` (physical ID = key ID) và `AWS::KMS::Alias` (physical ID = tên alias) tạo thật, không stub                                                                                                                                                                                                                                   |
| 8   | **Không hỗ trợ**                     | `ListKeyRotations` → `UnsupportedOperation` (Enable / GetKeyRotationStatus / RotateKeyOnDemand chạy)                                                                                                                                                                                                                                         |
| 9   | **Phân trang**                       | `ListKeys(Limit)` trả `Truncated` + `NextMarker`                                                                                                                                                                                                                                                                                             |
| 10  | **S3 bucket chưa cấu hình mã hóa**   | `GetBucketEncryption` trả mặc định `AES256` (không 404), nên trang bucket đọc được mà trình duyệt không ghi lỗi                                                                                                                                                                                                                              |

**Kết quả làm 2026-11-25:** IT 7, E2E 14 (luồng chính + chọn / hiện key ở 8 service), UI 3 trang × 4 khung đều pass. Khác spec: ô chọn key nhận cả alias (parameter SSM tạo ngoài console lưu `alias/aws/ssm`); Upload của S3 có form nhỏ riêng cho mã hóa; Floci trả lỗi 400 cho chữ ký / MAC sai (Try it hiện Invalid).

**Chưa kiểm:** Floci có thật sự xóa key khi hết hạn chờ (7 ngày) không; `DescribeKey` của key có `MacAlgorithms` (HMAC) — đọc khi làm.

---

## 8. Thứ tự làm

1. User cài package (mục 6). `registry.ts`, `useKMS`, routes.
2. Hàm thuần + unit test: `keys.ts` (nhãn, alias của key, ARN từ `TargetKeyId`, DER → PEM), schema form (alias, 7–30 ngày).
3. Danh sách (customer / AWS managed), `KeyStatus`, Actions.
4. Chi tiết: Details, Aliases, Key policy.
5. Create key.
6. Try it (đối xứng, RSA mã hóa, ký, HMAC), Connect card.
7. `KeyLink`, `KeySelect`; xem + chọn ở 8 service (mỗi service một bước nhỏ, theo bảng 3.6); StackLink và `resourceLinks.ts`.
8. Test: integration `tests/it/kms.test.ts` (tạo, alias, crypto, trạng thái, xóa; key gắn vào secret / queue đọc lại đúng); E2E một luồng chính (tạo key + alias → Try it encrypt / decrypt → tạo secret chọn key → link sang KMS → disable → trạng thái Disabled, Actions khóa đúng; lỗi `DisabledException` khi mã hóa chỉ kiểm ở IT, vì E2E fail khi trình duyệt ghi `console.error` (development.md › Traps)); trang danh sách và Create key vào `tests/ui/responsive.spec.ts`; key có alias `alias/lc-it-*` / `alias/lc-e2e-*` vào `tests/it/leftovers.mjs` (lên lịch xóa 7 ngày, xóa alias).

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024, 390 và 320px, light / dark, không trang nào cuộn ngang.

---

## 9. Cách đã cân nhắc

| Cách                           | Đánh đổi                                                                                  | Chọn                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------- |
| **A. `KeySelect` dùng chung**  | Dropdown theo alias, vẫn dán ARN được; SDK KMS vào phần tải lười của 8 trang; một chỗ sửa | ✅ (user chốt 2026-11-25) |
| B. Ô nhập tay ID / ARN / alias | Không phụ thuộc KMS nhưng dễ gõ sai, và SSM / SQS nhận key không tồn tại                  |                           |

## 10. Quyết định

| Quyết định                                                                                                                                                  | Lý do                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Phạm vi mục 2 theo tiêu chí roadmap                                                                                                                         | User chốt 2026-11-25                                                                                                                  |
| Chọn key trong form tạo của 8 service                                                                                                                       | User chốt 2026-11-25                                                                                                                  |
| Hai mục sidebar Customer / AWS managed keys, giống AWS                                                                                                      | Đề xuất của Claude, user không phản đối 2026-11-25                                                                                    |
| Chi tiết key theo query `?key=` nhận ID / ARN / alias                                                                                                       | Đề xuất của Claude: alias có `/` (như `?name=` của Secrets Manager); `DescribeKey` tự phân giải nên link dùng thẳng giá trị Floci trả |
| Ô chọn gửi ARN của key                                                                                                                                      | Đề xuất của Claude: Lambda chỉ nhận ARN; một dạng cho mọi service                                                                     |
| Lambda chọn key ở modal Environment, không ở form tạo                                                                                                       | Đề xuất của Claude: form tạo function không có biến môi trường                                                                        |
| S3 chọn key ở Create bucket và Upload                                                                                                                       | Đề xuất của Claude: Floci không áp mã hóa mặc định cho object mới                                                                     |
| Không làm sửa key policy / grant                                                                                                                            | Floci không bắt buộc quyền                                                                                                            |
| Trang key có Connect card (code mẫu theo KeyUsage)                                                                                                          | README: trang resource có Connect card; reviewer hỏi 2026-11-25, Claude quyết theo convention                                         |
| UI theo convention có sẵn: menu `Actions`, `KeyStatus`, `KeyLink` dò "(not found)", khối "Encryption" dùng `FormRadioGroup`, Try it như tab Test của Lambda | User yêu cầu 2026-11-25: component consistent, theo convention                                                                        |
| RDS: lưu trữ mặc định không mã hóa (như hiện tại), bật thì chọn key                                                                                         | Đề xuất của Claude: không đổi hành vi của DB console đang tạo                                                                         |
| E2E không gây lỗi KMS có chủ đích; lỗi key tắt kiểm ở IT                                                                                                    | Đề xuất của Claude: E2E fail khi có `console.error`, Traps cấm nới bộ lọc                                                             |
| `KeyValueEditor` chuyển sang `shared/components`                                                                                                            | Đề xuất của Claude: Secrets Manager và KMS cùng dùng                                                                                  |
| Không sửa server                                                                                                                                            | KMS là AWS API thuần, đi qua proxy `/aws`                                                                                             |
