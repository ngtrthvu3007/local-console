# Secrets Manager + SSM Parameter Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dev xem, seed, sửa secret và parameter mà app / IaC tạo trên Floci, test Lambda rotation, biết stack nào tạo ra chúng.

**Architecture:** Hai service mới trong `registry.ts` (`secretsmanager`, `ssm`), mỗi service một thư mục như SNS: `routes.ts`, `constants.ts`, `schemas.ts`, hooks TanStack Query gọi SDK qua proxy `/aws`, trang nạp lười bằng `lazyPage`. Tên có `/` nên trang chi tiết dùng `?name=` (như `?key=` của S3). Logic thuần (JSON ↔ key/value, tên từ ARN, schema) có unit test; UI có E2E viết trước.

**Tech Stack:** React 19, Cloudscape, react-hook-form + zod (`useZodForm`), TanStack Query v5, `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ssm` (đã có trong `web/` và `tests/`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-secrets-ssm-design.md` (đã duyệt 2026-11-19).

## Global Constraints

- **Không cài package** (hai SDK đã có sẵn trong `web/package.json` và `tests/package.json`, spec mục 6 không còn việc). Không sửa server.
- Không làm: versions / stage, restore, history / label, tag, policy, replication, binary secret (chỉ hiện "Binary secret — not shown"), xóa secret không recovery window.
- Route: `/secretsmanager/secrets`, `/secretsmanager/secrets/create`, `/secretsmanager/secrets/detail?name=`; `/ssm/parameters`, `/ssm/parameters/create`, `/ssm/parameters/edit?name=`, `/ssm/parameters/detail?name=`.
- Sidebar: Secrets Manager › **Secrets**; Systems Manager › **Parameter Store**.
- Tên secret: 1–512 ký tự `A-Za-z0-9/_+=.@-`. Tên parameter: `a-zA-Z0-9_.-/`, có `/` thì phải bắt đầu bằng `/`.
- Recovery window 7–30 ngày, mặc định 7. Mô tả modal xóa: `The secret is hidden and can't be read until the window ends. Creating a secret with the same name fails until then.`
- Rotate ngay xong: `Rotation started in the background. Refresh to see the new value; if it doesn't change, check the Lambda's logs.` kèm link log Lambda (`lambdaRoutes.function(tên, FUNCTION_TABS.monitor)`). Không tự polling.
- Edit rotation lưu bằng `RotateSecret` với `RotateImmediately: false`; tắt → `CancelRotateSecret`.
- Giá trị secret chỉ lấy khi bấm **Retrieve secret value**. Tab Key/value chỉ khi giá trị là JSON object phẳng, mọi value là string; Plaintext lưu nguyên văn.
- SecureString che mặc định, **Show** mới hiện.
- Code theo CLAUDE.md: hằng số trong `constants.ts`, comment tiếng Việt ngắn nói lý do, dòng trống quanh câu lệnh ≥ 3 dòng, hạn chế type assertion. `registry.ts` / `index.tsx` không import SDK hay zod (chunk chính).
- Kiểm Floci 2.4.0 qua proxy ngày 2026-11-23 (chốt 2 điểm "kiểm khi làm" của spec): SDK v3 đi qua `/aws` được; physical ID `AWS::SecretsManager::Secret` = ARN đủ hậu tố (`…:secret:<tên>-AbC123`), `AWS::SSM::Parameter` = tên; secret không có → `ResourceNotFoundException` (400, `isNotFoundError` đã bắt); parameter không có → `ParameterNotFound` (400, phải tự bắt).

## Rulings đã chốt trong plan (user duyệt plan là duyệt các mục này)

1. **Tìm kiếm ở danh sách lọc phía client** (`useCollection` + `TextFilter`, như mọi bảng khác), không gửi `Filters` / `ParameterFilters` theo từng phím gõ. Đổi so với spec 3.1, 3.5. Lý do: local ít resource, giữ một pattern. Sai thì: list rất dài (hàng nghìn) tải chậm.
2. **Recovery window là `Select` 7–30**, không phải ô nhập số: không có trạng thái nhập sai. Sai thì: chỉ khác giao diện AWS.
3. **Thêm `FormToggle`** vào `shared/components/form/FormFields.tsx` (bản sao `FormCheckbox` dùng `Toggle`) cho "Automatic rotation" như spec. Sai thì: thêm một wrapper ~20 dòng không cần thiết.
4. Icon: Secrets Manager `IconKey`, danh mục `security`; Systems Manager `IconAdjustments`, danh mục `management` (registry dùng glyph Tabler, không có file svg như spec mục 6 ghi).

## Review Focus

1. **Secret JSON không phẳng** (`{"port": 5432}`, object lồng, `null`, mảng) → chỉ có Plaintext; Edit lưu lại nguyên văn, không đổi kiểu (test: Task 1 unit `keyValueOf`, Task 3 E2E).
2. **Tên có `/`** (`app/dev/db`, `/app/dev/db-host`) → link, breadcrumb, mở lại trang đều đúng tên (test: Task 1 unit routes, E2E Task 2 và Task 5 dùng tên có `/`).
3. **Mở `?name=` không tồn tại** (secret vừa xóa, link cũ) → "Secret … not found" / "Parameter … not found" kèm link về danh sách, không console.error (test: Task 3, Task 5).
4. **Xóa > 10 parameter** → chia lô 10, báo đúng số đã xóa (test: Task 5 unit `chunks`; IT Task 7).
5. **Rotate khi Lambda lỗi** → console chỉ báo "started in the background", không treo, không lỗi đỏ (test: Task 4 E2E với Lambda có `throw`).

---

### Task 1: Logic thuần + unit test

**Files:**

- Create: `web/src/services/secretsmanager/routes.ts`, `constants.ts`, `schemas.ts`, `secretValue.ts`
- Create: `web/src/services/ssm/routes.ts`, `constants.ts`, `schemas.ts`, `parameters.ts`
- Test: `web/test/services/secretsmanager/secretsmanager.test.ts`, `web/test/services/ssm/ssm.test.ts`

**Interfaces — Produces:**

- `SECRETS_SERVICE_ID = "secretsmanager"`, `SECRETS_ROUTE_PATTERNS = { secrets: "secrets", createSecret: "secrets/create", secret: "secrets/detail" }`, `SEARCH_PARAMS = { name: "name" }`
- `secretsRoutes = { secrets, createSecret, secret(name: string): string, secretOfArn(arn: string): string }`, `secretsBaseCrumbs`, `secretCrumbs(name)`
- `secretNameOfArn(arn: string): string` — phần sau `:secret:`, bỏ `-` + 6 ký tự cuối
- `interface KeyValue { key: string; value: string }`; `keyValueOf(text: string): KeyValue[] | undefined`; `textOfKeyValue(entries: readonly KeyValue[]): string` (`JSON.stringify` object, không thụt lề)
- `secretNameSchema`, `createSecretSchema` (`{ type: "keyValue" | "plaintext", entries: KeyValue[], plaintext: string, name, description }`), `keyValueSchema` (`{ entries }`: key bắt buộc, không trùng), `rotationSchema` (`{ enabled: boolean, lambdaArn: string, scheduleType: "days" | "expression", days: string → number 1–1000, expression: string }` → output có `scheduleExpression: string`)
- `SSM_SERVICE_ID = "ssm"`, `SSM_ROUTE_PATTERNS = { parameters: "parameters", createParameter: "parameters/create", editParameter: "parameters/edit", parameter: "parameters/detail" }`
- `ssmRoutes = { parameters, createParameter, editParameter(name), parameter(name) }`, `ssmBaseCrumbs`, `parameterCrumbs(name)`
- `PARAMETER_TYPES = { String: …, StringList: …, SecureString: … }` (nhãn + mô tả cho Tiles), `parameterSchema(editing: boolean)` (`{ name, description, type, value }`)
- `chunks<T>(items: readonly T[], size: number): T[][]` trong `web/src/services/ssm/parameters.ts` (file thuần); `DELETE_PARAMETERS_BATCH = 10` trong `ssm/constants.ts`

- [ ] **Step 1: Viết test (RED)**

```ts
// secretsmanager.test.ts
it("reads the name from a secret ARN, dropping the 6-character suffix", () => {
  expect(
    secretNameOfArn("arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:app/db-AbC123"),
  ).toBe("app/db");
  expect(secretsRoutes.secretOfArn("arn:aws:secretsmanager:r:0:secret:app/db-AbC123")).toBe(
    "/secretsmanager/secrets/detail?name=app%2Fdb",
  );
});
it("offers key/value only for a flat JSON object of strings", () => {
  expect(keyValueOf('{"username":"app","password":"x"}')).toEqual([
    { key: "username", value: "app" },
    { key: "password", value: "x" },
  ]);
  for (const text of [
    '{"port":5432}',
    '{"a":{"b":"c"}}',
    "null",
    '["a"]',
    "plain",
    '{"a":null}',
    '{"a":true}',
  ])
    expect(keyValueOf(text)).toBeUndefined();
  expect(keyValueOf("{}")).toEqual([]);
});
it("writes key/value back as a JSON object", () => {
  expect(textOfKeyValue([{ key: "u", value: "a" }])).toBe('{"u":"a"}');
});
it("checks secret names", () => {
  /* "app/db+x=y.z@w-1" ok; "" , "a b", "a".repeat(513) lỗi */
});
it("rejects empty and duplicate keys", () => {
  /* keyValueSchema */
});
it("builds the rotation schedule", () => {
  // days "30" → "rate(30 days)"; "0" / "1001" / "x" lỗi; expression "cron(0 12 * * ? *)" giữ nguyên, "every day" lỗi;
  // enabled=false thì không bắt lambdaArn; enabled=true mà lambdaArn rỗng → "Choose a function."
});

// ssm.test.ts
it("puts the parameter name in the query string", () => {
  expect(ssmRoutes.parameter("/app/dev/db-host")).toBe(
    "/ssm/parameters/detail?name=%2Fapp%2Fdev%2Fdb-host",
  );
});
it("checks parameter names", () => {
  // ok: "db-host", "/app/dev/db_host.v1"; lỗi: "app/dev" (có / mà không bắt đầu bằng /), "a b", ""
  // editing: name không kiểm (khóa)
});
it("splits into batches", () => {
  expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
```

- [ ] **Step 2: Chạy, thấy fail** — `cd web && npx vitest run test/services/secretsmanager test/services/ssm` → FAIL (module chưa có).
- [ ] **Step 3: Viết code** theo Interfaces. Route dựng như `s3Routes.object` (`?name=` bằng `URLSearchParams`). Ký tự tên và giới hạn để trong `constants.ts`.
- [ ] **Step 4: Chạy lại** → PASS; `npx tsc -b && npm run lint` sạch.
- [ ] **Step 5: Báo commit** (user tự chạy): `feat(secrets-ssm): routes, schemas and secret value helpers`.

### Task 2: Đăng ký service, danh sách + tạo + xóa secret

**Files:**

- Create: `web/src/services/secretsmanager/index.tsx`, `hooks/useSecretsManager.ts`, `hooks/useSecrets.ts`, `pages/SecretList.tsx`, `pages/CreateSecret.tsx`, `components/DeleteSecretModal.tsx`, `components/KeyValueEditor.tsx`
- Modify: `web/src/registry.ts` (thêm `secretsManagerService` sau `cognitoService`; `ssmService` thêm ở Task 5)
- Test: `tests/e2e/secretsmanager.spec.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: `useSecretsManager()` (`useAwsClient(SecretsManagerClient)`), `SECRETS_QUERY_ROOT = "secretsmanager"`, `useSecrets()` (vòng `NextToken` bằng `paginateListSecrets`), `useCreateSecret()`, `useDeleteSecret()` (`{ name, recoveryDays }`), `secretQueryKey(name, part?)`; `KeyValueEditor` (AttributeEditor + `useFieldArray`, dùng lại cho Task 3); `DeleteSecretModal({ name, onDismiss, onDone })`.

- [ ] **Step 1: E2E (RED)** — `tests/e2e/secretsmanager.spec.ts`, tên `lc-e2e-…/app` (có `/`):
  - `"creates a key/value secret and opens it"`: sidebar có "Secrets" → Store a new secret → Key/value thêm `username=app`, `password=p1` → Create → URL `/secretsmanager/secrets/detail?name=…`, heading là tên.
  - `"creates a plaintext secret"`; `"a name already in use shows Floci's error"` (`ResourceExistsException`, trong nhóm `danglingProbes`).
  - `"lists secrets and deletes one with a recovery window"`: bảng có tên, cột Rotation `—`; chọn → Delete → modal có mô tả của Global Constraints, Select mặc định `7 days`, gõ `delete` → secret biến khỏi bảng; SDK `DescribeSecret` có `DeletedDate`.
  - `afterAll`: `DeleteSecret ForceDeleteWithoutRecovery`.
- [ ] **Step 2:** rebuild (`docker compose up --build -d console`), chạy `cd tests && npx playwright test --project=e2e e2e/secretsmanager.spec.ts` → FAIL (không có trang).
- [ ] **Step 3: Viết code.** Bảng theo `sns/pages/TopicList.tsx` (chọn một: `selectionType='single'`; cột Secret name, Description, Last changed `formatDate`, Rotation `StatusIndicator` "Enabled" hoặc `NOT_AVAILABLE`); form theo `sns/pages/CreateTopic.tsx` (Tiles Key/value mặc định, Plaintext dùng `FormValueEditor` `language='text'`); `KeyValueEditor` theo `EnvironmentModal` của `lambda/components/ConfigurationTab.tsx`. Tạo xong `navigate(secretsRoutes.secret(name))`. Trang chi tiết tạm: chỉ heading (Task 3 làm tiếp).
- [ ] **Step 4:** E2E PASS; `tsc`, lint sạch; `npm run build` rồi kiểm chunk chính không có `client-secrets-manager` (như test bundle hiện có).
- [ ] **Step 5: Báo commit:** `feat(secretsmanager): list, create and delete secrets`.

### Task 3: Chi tiết secret — giá trị, mô tả

**Files:**

- Create: `pages/SecretDetail.tsx`, `components/SecretValue.tsx`, `components/EditSecretValueModal.tsx`, `components/EditDescriptionModal.tsx`
- Modify: `hooks/useSecrets.ts` (`useSecret(name)` = `DescribeSecret`, `retry: false`; `useSecretValue(name, enabled)` = `GetSecretValue`; `usePutSecretValue`, `useUpdateDescription`)
- Test: `tests/e2e/secretsmanager.spec.ts`

**Interfaces:**

- Produces: `useSecret(name)` trả `DescribeSecretResponse`; `isSecretMissing(error) = isNotFoundError(error)`; Task 4 đọc `RotationEnabled`, `RotationLambdaARN`, `RotationRules`, `LastRotatedDate`, `NextRotationDate` từ `useSecret`.

- [ ] **Step 1: E2E (RED)**:
  - `"retrieves the value only when asked"`: chưa bấm thì không có request `GetSecretValue` (`page.on("request")` lọc header `x-amz-target` chứa `GetSecretValue`) và không thấy `p1`; bấm **Retrieve secret value** → bảng Key/value có `password` / `p1`.
  - `"edits a key/value secret"`: Edit → đổi `p1` → `p2` → Save → SDK `GetSecretValue` = `{"username":"app","password":"p2"}`.
  - `"a secret that is not flat key/value is edited as plaintext, kept as typed"`: secret seed `{"port": 5432}` (có khoảng trắng) → chỉ có Plaintext; Edit thêm dòng → SDK đọc đúng văn bản đã gõ.
  - `"edits the description"`; `"shows ARN with a copy button"`.
  - `"an unknown secret shows not found"` (`?name=lc-e2e-missing`, nhóm `danglingProbes`) → "Secret lc-e2e-missing not found", link "View secrets".
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Trang theo `sns/pages/TopicDetail.tsx` + `pageState` (`notFound: isSecretMissing`); action Delete mở `DeleteSecretModal` (Task 2), xong về danh sách. `SecretValue`: state `retrieved`; `keyValueOf` quyết định có `SegmentedControl` Key/value | Plaintext hay chỉ Plaintext; `SecretBinary` → `Binary secret — not shown`, không nút Edit. Edit mở modal theo tab đang xem: Key/value → `KeyValueEditor` → `textOfKeyValue`; Plaintext → `FormValueEditor` lưu nguyên văn. Lưu xong invalidate `secretQueryKey(name)`.
- [ ] **Step 4:** PASS; tsc, lint.
- [ ] **Step 5: Báo commit:** `feat(secretsmanager): secret detail, retrieve and edit value and description`.

### Task 4: Rotation

**Files:**

- Create: `components/RotationSection.tsx`, `components/EditRotationModal.tsx`
- Modify: `hooks/useSecrets.ts` (`useConfigureRotation` → `RotateSecret` `RotateImmediately: false`; `useCancelRotation`; `useRotateNow`), `shared/components/form/FormFields.tsx` (`FormToggle`, ruling 3), `pages/SecretDetail.tsx`
- Test: `tests/e2e/secretsmanager.spec.ts` (describe riêng `"rotation"`), unit `rotationSchema` đã có ở Task 1

**Interfaces:**

- Consumes: `useFunctions()` (Lambda, `FunctionArn`, `FunctionName`), `lambdaRoutes.function(name, FUNCTION_TABS.monitor)`, `rotationSchema`.
- Produces: `rotationFormValues(secret: DescribeSecretResponse)` trong `schemas.ts` cạnh `rotationSchema` → giá trị ban đầu của modal: `RotationRules.ScheduleExpression` dạng `rate(N days)` → `scheduleType: "days"`, `days: "N"`; biểu thức khác → `"expression"`; không có → `days: "30"`; `lambdaArn` = `RotationLambdaARN ?? ""`.

- [ ] **Step 1: Test (RED)**:
  - Unit: `rotationFormValues` cho `rate(30 days)`, `cron(0 12 * * ? *)`, không cấu hình.
  - E2E `beforeAll` tạo 2 Lambda (`nodejs22.x`, zip bằng `fflate` như `it/stepfunctions-flows.test.ts`): `lc-e2e-…-rotate` làm đủ 4 bước theo template AWS (createSecret `PutSecretValue` `AWSPENDING` giá trị mới; finishSecret `UpdateSecretVersionStage` chuyển `AWSCURRENT`), `lc-e2e-…-broken` `throw`.
  - `"turns on rotation with a function and a schedule"`: Edit rotation → bật toggle → chọn function → Days `1` → Save → Status Enabled, link function tới tab Monitor, Schedule `rate(1 days)`. **Giá trị không đổi** (Floci chỉ gọi `testSecret`, spec 7 #3).
  - `"rotates now and the value changes"`: Rotate secret immediately → flash đúng câu Global Constraints + link log → `expect.poll` SDK `GetSecretValue` khác giá trị cũ; Refresh → Last rotated có ngày.
  - `"a failing rotation function only shows the background notice"` (Review Focus 5).
  - `"turns rotation off"` → Status Disabled.
  - `"rotate now is disabled until a function is set"`: secret chưa cấu hình → nút Rotate secret immediately disabled (spec: "chỉ bật khi đã có Lambda").
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** Lưu: bật → `useConfigureRotation`; tắt mà đang bật → `useCancelRotation`; tắt mà đang tắt → đóng modal. Thông báo rotate ngay: `notifySuccess(ROTATION_STARTED_MESSAGE, <Link … >View Lambda logs</Link>)`.
- [ ] **Step 4:** PASS. **Nếu E2E "rotates now" fail vì Floci** (spec 7 #12: lần kiểm 2026-11-19 Lambda theo template AWS không thấy `AWSPENDING`): debug bằng log Lambda; nếu đúng là Floci, ledger `Ruling:` và đổi Lambda test sang dạng đã xoay thành công lần khảo sát trước — không sửa console để che lỗi Floci.
- [ ] **Step 5: Báo commit:** `feat(secretsmanager): rotation with a Lambda, schedule and rotate now`.

### Task 5: Parameter Store

**Files:**

- Create: `web/src/services/ssm/index.tsx`, `parameters.ts` (`chunks`, `DELETE_PARAMETERS_BATCH = 10` ở `constants.ts`), `hooks/useSSM.ts`, `hooks/useParameters.ts`, `pages/ParameterList.tsx`, `pages/ParameterForm.tsx`, `pages/ParameterDetail.tsx`, `components/ParameterValue.tsx`, `components/DeleteParametersModal.tsx`
- Modify: `web/src/registry.ts` (`ssmService`)
- Test: `tests/e2e/ssm.spec.ts`

**Interfaces:**

- Produces: `SSM_QUERY_ROOT = "ssm"`; `useParameters()` (`paginateDescribeParameters`); `useParameter(name)` = `GetParameter` `WithDecryption: true` + `DescribeParameters` (`ParameterFilters: [{ Key: "Name", Option: "Equals", Values: [name] }]`) → `{ parameter, description }`; `isParameterMissing(error)` = `name === "ParameterNotFound"`; `usePutParameter(editing)`; `useDeleteParameters()` trả `{ count, failures }` (gộp `InvalidParameters` của từng lô) cho `notifyBulkOutcome`.

- [ ] **Step 1: E2E (RED)** — tên `/lc-e2e-…/db-host`:
  - `"creates String and SecureString parameters"`: sidebar Systems Manager › Parameter Store → Create parameter → String `/…/db-host` = `localhost` → chi tiết hiện `localhost`; SecureString `/…/db-password` = `s3cret` (ô password) → chi tiết `••••••••`, không thấy `s3cret`; Show → thấy.
  - `"edits a parameter; name is locked"`: Edit → ô tên khóa → giá trị mới → Version tăng lên 2.
  - `"StringList keeps commas"`: `a,b,c` → chi tiết `a,b,c`.
  - `"deletes several parameters"`: seed 12 parameter bằng SDK, chọn hết → Delete → gõ `delete` → flash `Deleted 12 parameters`, bảng trống.
  - `"an unknown parameter shows not found"` (`danglingProbes`).
  - `"a name with / not at the start is rejected"` → lỗi dưới ô tên, không gọi API.
- [ ] **Step 2:** rebuild, chạy → FAIL.
- [ ] **Step 3: Viết code.** List: multi-select, cột Name, Type, Version (`Figure`), Last modified. Form: một trang cho tạo / sửa (như `cloudformation/pages/StackTemplateForm.tsx`), `PutParameter` (`Overwrite: true` khi sửa, không gửi Tier). Value: `FormTextarea`, SecureString `FormInput type='password'`. Detail: `KeyValuePairs` (Type, Version · Last modified, Value, Description, ARN + `CopyButton`), action Delete + Edit.
- [ ] **Step 4:** PASS; tsc, lint; chunk chính không có `client-ssm`.
- [ ] **Step 5: Báo commit:** `feat(ssm): Parameter Store list, create, edit, detail and delete`.

### Task 6: Nối CloudFormation

**Files:**

- Modify: `web/src/services/cloudformation/resourceLinks.ts` (`"AWS::SecretsManager::Secret": (id) => secretsRoutes.secretOfArn(id)`, `"AWS::SSM::Parameter": (id) => ssmRoutes.parameter(id)`), `secretsmanager/pages/SecretDetail.tsx` (`<StackLink separated type='AWS::SecretsManager::Secret' physicalId={secret.ARN} />`), `ssm/pages/ParameterDetail.tsx` (`physicalId={name}`)
- Modify: spec CloudFormation bảng 3.10 thêm hai dòng
- Test: `web/test/services/cloudformation/cloudformation.test.ts` (resourceHref), `tests/e2e/secrets-ssm-links.spec.ts`

- [ ] **Step 1: Test (RED)**: unit `resourceHref` cho ARN secret và tên parameter; E2E stack có `AWS::SecretsManager::Secret` (`GenerateSecretString`) + `AWS::SSM::Parameter` → tab Resources link mở đúng trang chi tiết, trang đó có "Stack: <tên>" link về stack.
- [ ] **Step 2–4:** FAIL → viết → PASS.
- [ ] **Step 5: Báo commit:** `feat(secrets-ssm): link secrets and parameters with CloudFormation`.

### Task 7: IT, dọn dẹp test, UI, spec

**Files:**

- Create: `tests/it/secrets-ssm.test.ts`
- Modify: `tests/it/leftovers.mjs` (secret `lc-it-` / `lc-e2e-`, kể cả đang chờ xóa: `ListSecrets` `IncludePlannedDeletion: true` → `ForceDeleteWithoutRecovery`; parameter: bỏ `/` đầu rồi so tiền tố), `tests/ui/responsive.spec.ts` (`secretsmanager-secrets`, `secretsmanager-create`, `ssm-parameters`, `ssm-create`), spec header → `đã làm (<ngày>)` kèm tên file test
- [ ] **Step 1: IT** (theo spec mục 8 bước 7): CRUD secret qua proxy (ARN đủ / thiếu hậu tố); rotation với Lambda thật (4 bước, `AWSCURRENT` đổi); SecureString trả rõ không cần `WithDecryption`; `DeleteParameters` 11 tên (lô 10 + 1) có 1 tên không tồn tại → `InvalidParameters` đúng tên đó.
- [ ] **Step 2:** `cd tests && npm run test:it -- secrets-ssm` PASS; `node it/leftovers.mjs` sau cả suite → không còn gì.
- [ ] **Step 3:** Full suite: typecheck, lint, unit, IT, E2E, UI (`npm run test:ui`), mobile (`LOCAL_CONSOLE_URL=http://localhost:3701 npm run test:mobile`). Chụp 1440 / 1024 / 390 các trang mới, không cuộn ngang.
- [ ] **Step 4:** Cập nhật memory `service-status`; báo commit: `test(secrets-ssm): integration tests, leftovers, responsive pages`.
