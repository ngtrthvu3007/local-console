# CloudFormation: tạo / sửa stack từ template YAML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người không quen CLI / CDK viết template YAML, Deploy, sửa rồi Deploy lại ngay trên console.

**Architecture:** Một trang dùng chung cho tạo và sửa (giống `eventbridge/pages/RuleForm.tsx`), nạp lười. Deploy gọi `CreateStack` / `UpdateStack` qua SDK CloudFormation đã có (`stacks.ts`), sửa thì nạp template bằng `GetTemplate`. Lỗi API trả ngay hiện dưới editor; còn lại xem ở tab Events.

**Tech Stack:** React 19, Cloudscape, react-hook-form + zod (`useZodForm`), TanStack Query, AWS SDK v3 `@aws-sdk/client-cloudformation`, Ace (`CodeEditor`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-cloudformation-design.md`, mục **3.6** (và mục 2, 4, 7, 9 cùng ngày 2026-11-23).

## Global Constraints

- Không cài package mới. Không sửa server. Chỉ đi qua proxy `/aws` như phần còn lại.
- Editor chỉ tô màu YAML (mode `yaml` của Ace có sẵn trong `ace-builds`). Không chuyển JSON ↔ YAML.
- Không làm: ô nhập Parameters, upload file, change set / diff, kiểm tra template trước khi deploy.
- Route: `/cloudformation/stacks/create` và `/cloudformation/stacks/:stack/edit`, cùng một component, nạp bằng `lazyPage`.
- Tên stack: bắt đầu bằng chữ cái, chỉ chữ, số và `-`, tối đa 128 ký tự.
- Template mẫu (điền sẵn khi tạo): 1 queue + 1 output, đúng như spec:

  ```yaml
  Resources:
    Queue:
      Type: AWS::SQS::Queue
  Outputs:
    QueueUrl:
      Value: !Ref Queue
  ```

- Khóa "Edit template" khi stack có resource `AWS::CDK::Metadata`, lý do: `Deployed by CDK: edit it in your CDK app. cdk deploy would overwrite changes made here.`; và khi stack `*_IN_PROGRESS` (kể cả `REVIEW_IN_PROGRESS`).
- Dòng nhắc dưới editor khi sửa: `Deploying this stack again from a file replaces changes made here.`
- Deploy xong → trang stack, tab Events (tab mặc định). Lỗi API → lỗi gốc dưới editor, giữ nội dung. Update không đổi gì (Floci: `No updates are to be performed.`) → thông báo info, ở lại trang.
- Code theo CLAUDE.md: không hardcode (hằng số trong `constants.ts`), comment tiếng Việt ngắn nói lý do, dòng trống quanh câu lệnh từ 3 dòng trở lên, không thêm SDK / zod vào chunk chính (`registry.ts`, `index.tsx` chỉ có route).

## Review Focus

1. **Tên stack đã có** khi tạo → lỗi `AlreadyExistsException` của Floci hiện dưới editor, nội dung giữ nguyên (test: Task 4).
2. **Template có `Parameters` không `Default`** → lỗi Floci hiện dưới editor, không chuyển trang (test: Task 4).
3. **Mở `/cloudformation/stacks/<tên-không-có>/edit`** (stack vừa xóa, link cũ) → trang "Stack … not found" kèm link về danh sách, không crash (test: Task 4).
4. **Sửa stack tạo bằng file JSON** (CLI) → editor mở được JSON, Deploy update thành công (JSON là YAML hợp lệ) (test: Task 4).
5. **Deploy lại không đổi gì** → thông báo info, ở lại trang, không coi là lỗi (test: Task 1 unit cho `isNoUpdatesError`, Task 4 E2E).

---

### Task 1: Luật, hằng số và API thuần

**Files:**

- Modify: `web/src/services/cloudformation/constants.ts`
- Create: `web/src/services/cloudformation/schemas.ts`
- Modify: `web/src/services/cloudformation/status.ts`
- Modify: `web/src/services/cloudformation/stacks.ts`
- Test: `web/test/services/cloudformation/cloudformation.test.ts`

**Interfaces:**

- Produces:
  - `constants.ts`: `STACK_NAME_PATTERN = /^[A-Za-z][-A-Za-z0-9]*$/`, `STACK_NAME_MAX_LENGTH = 128`, `STARTER_TEMPLATE: string` (YAML ở Global Constraints), `NO_UPDATES_MESSAGE = "No updates are to be performed"`, `CDK_EDIT_LOCK_REASON`, `RUNNING_EDIT_LOCK_REASON = "Wait until the stack finishes."`, `EDIT_TEMPLATE_NOTE` (copy ở Global Constraints).
  - `schemas.ts`: `stackTemplateSchema` = `z.object({ name, template })`; `name`: trim, khớp `STACK_NAME_PATTERN` ("Start with a letter; use only letters, numbers and hyphens (-)."), tối đa `STACK_NAME_MAX_LENGTH` ("Must be at most 128 characters."); `template`: trim, min 1 ("Enter a template."). `type StackTemplateForm = z.input<typeof stackTemplateSchema>`.
  - `status.ts`: `isCdkStack(resources: readonly { ResourceType?: string }[]): boolean` (có `CDK_METADATA_TYPE`); `isNoUpdatesError(error: unknown): boolean` (message chứa `NO_UPDATES_MESSAGE`).
  - `stacks.ts`: `createStack(client, name: string, template: string): Promise<void>` (`CreateStackCommand { StackName, TemplateBody }`); `updateStack(client, name, template): Promise<void>` (`UpdateStackCommand`); `getTemplate(client, name): Promise<string>` (`GetTemplateCommand { StackName, TemplateStage: "Original" }` → `TemplateBody ?? ""`).

- [ ] **Step 1: Viết test fail** trong `cloudformation.test.ts`:

```ts
describe("stackTemplateSchema", () => {
  it("accepts an AWS stack name and a template", () => {
    expect(
      stackTemplateSchema.safeParse({ name: "my-stack-1", template: STARTER_TEMPLATE }).success,
    ).toBe(true);
  });

  it("rejects names that start with a digit, have other characters or are too long, and an empty template", () => {
    const issue = (name: string, template = "x") =>
      stackTemplateSchema.safeParse({ name, template }).error?.issues[0]?.message;
    expect(issue("1stack")).toBe("Start with a letter; use only letters, numbers and hyphens (-).");
    expect(issue("my_stack")).toBe(
      "Start with a letter; use only letters, numbers and hyphens (-).",
    );
    expect(issue(`a${"b".repeat(128)}`)).toBe("Must be at most 128 characters.");
    expect(issue("ok", "   ")).toBe("Enter a template.");
  });
});

describe("edit helpers", () => {
  it("knows a CDK stack by its metadata resource", () => {
    expect(
      isCdkStack([{ ResourceType: "AWS::SQS::Queue" }, { ResourceType: "AWS::CDK::Metadata" }]),
    ).toBe(true);
    expect(isCdkStack([{ ResourceType: "AWS::SQS::Queue" }])).toBe(false);
  });

  it("tells a no-op update from a real error", () => {
    expect(isNoUpdatesError(new Error("No updates are to be performed."))).toBe(true);
    expect(isNoUpdatesError(new Error("Template format error"))).toBe(false);
    expect(isNoUpdatesError("oops")).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, phải fail**

Run: `cd web && npx vitest run test/services/cloudformation`
Expected: FAIL (`stackTemplateSchema`, `isCdkStack`, `isNoUpdatesError` chưa có).

- [ ] **Step 3: Thêm hằng số, `schemas.ts`, `isCdkStack`, `isNoUpdatesError`, `createStack` / `updateStack` / `getTemplate`** theo Interfaces. Schema dùng `z` như các `schemas.ts` khác (form chạy qua `useZodForm`).

- [ ] **Step 4: Chạy test, phải pass**

Run: `cd web && npx vitest run test/services/cloudformation && npx tsc -b && npx oxlint`
Expected: PASS, tsc và lint sạch.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/cloudformation web/test/services/cloudformation
git commit -m "feat(cloudformation): stack name rules and create / update / get template calls"
```

### Task 2: Trang Create / Edit stack

**Files:**

- Modify: `web/src/shared/components/CodeEditor.tsx` (thêm `"yaml"` vào `EditorLanguage`, import `ace-builds/src-noconflict/mode-yaml`)
- Modify: `web/src/shared/components/ValueEditor.tsx` (`ValueEditor` và `FormValueEditor` nhận `language?: EditorLanguage`; có thì dùng, không thì đoán như cũ; `FormValueEditor` nhận thêm `description?: ReactNode` truyền vào `FormField`)
- Modify: `web/src/services/cloudformation/routes.ts`
- Modify: `web/src/services/cloudformation/hooks/useStacks.ts`
- Create: `web/src/services/cloudformation/pages/StackTemplateForm.tsx`
- Modify: `web/src/services/cloudformation/index.tsx`
- Modify: `web/src/shared/hooks/useNotify.ts` (thêm `notifyInfo`)

**Interfaces:**

- Consumes: Task 1 (`stackTemplateSchema`, `StackTemplateForm`, `STARTER_TEMPLATE`, `EDIT_TEMPLATE_NOTE`, `isNoUpdatesError`, `createStack`, `updateStack`, `getTemplate`, `isStackMissing` có sẵn).
- Produces:
  - `routes.ts`: `CLOUDFORMATION_ROUTE_PATTERNS.createStack = "stacks/create"`, `.editStack = "stacks/:stack/edit"`; `cloudformationRoutes.createStack: string`, `cloudformationRoutes.editStack(stack: string): string`.
  - `useStacks.ts`: `useStackTemplate(name: string)` (query, `retry: false`, key `stackQueryKey(name, "template")`); `useDeployStack(editing: boolean)` (mutation nhận `{ name, template }`, gọi `updateStack` nếu `editing` không thì `createStack`; `onSuccess` invalidate `stacksQueryKey`, `stackQueryKey(name)` và `resourceIndexQueryKey`).
  - `useNotify.ts`: `notifyInfo(content: string)` (`notify({ type: "info", content })`).
  - `pages/StackTemplateForm.tsx`: `export function StackTemplateForm()`.

- [ ] **Step 1: `CodeEditor` hỗ trợ `yaml`; `ValueEditor` / `FormValueEditor` nhận `language`, `description`.** Không đổi hành vi chỗ đang dùng (không truyền `language` thì đoán như cũ).

- [ ] **Step 2: Route, hook, `notifyInfo`** theo Interfaces. Hai route mới khai báo trong `index.tsx` bằng `lazyPage(() => import("./pages/StackTemplateForm.tsx"), "StackTemplateForm")`.

- [ ] **Step 3: `StackTemplateForm`** (theo bố cục `RuleForm`: `Form` + `ResponsiveActions footer` có Cancel / Deploy):
  - `useParams().stack` có → sửa: nạp `useStackTemplate`; không có stack thì `pageState` "Stack … not found" (`isStackMissing`, back về danh sách); tên stack hiện chỉ đọc; `FormValueEditor` `language='yaml'`, `description={EDIT_TEMPLATE_NOTE}`. Tiêu đề "Edit <stack>".
  - Không có → tạo: tiêu đề "Create stack", `FormInput` tên, editor điền `STARTER_TEMPLATE`.
  - Breadcrumb: `stacksCrumbs` + "Create stack" hoặc `stackCrumbs(stack)` + "Edit template".
  - Submit: `deploy.mutate(values, { onSuccess: () => { notifySuccess(\`Deployed stack ${name}\`); navigate(cloudformationRoutes.stack(name)); }, onError: (error) => isNoUpdatesError(error) ? notifyInfo("No changes to deploy.") : form.setError("template", { message: errorMessage(error) }) })`.
  - Cancel: về trang stack (sửa) hoặc danh sách (tạo).

- [ ] **Step 4: Kiểm tra**

Run: `cd web && npx tsc -b && npx oxlint && npx vitest run`
Expected: tsc, lint sạch; unit pass.
Mở `npm run dev:web`, `/cloudformation/stacks/create`: thấy template mẫu tô màu YAML; Deploy → sang trang stack tab Events có `CREATE_COMPLETE`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(cloudformation): create and edit a stack from a YAML template"
```

### Task 3: Nút trên danh sách và trang stack

**Files:**

- Modify: `web/src/services/cloudformation/pages/StackList.tsx`
- Modify: `web/src/services/cloudformation/pages/StackDetail.tsx`

**Interfaces:**

- Consumes: `cloudformationRoutes.createStack`, `cloudformationRoutes.editStack(stack)` (Task 2); `isCdkStack`, `isRunning`, `CDK_EDIT_LOCK_REASON`, `RUNNING_EDIT_LOCK_REASON` (Task 1); `useStackResources(name, running)` có sẵn (query dùng chung với tab Resources, không gọi thêm API).

- [ ] **Step 1: `StackList`**: thêm vào `barActions` `{ id: "create", text: "Create stack", primary: true, href: cloudformationRoutes.createStack }`. Empty state của bảng thêm nút "Create stack" cùng href.

- [ ] **Step 2: `StackDetail`**: thêm vào `ActionBar` (trước Delete) `{ id: "edit", text: "Edit template", href: cloudformationRoutes.editStack(name), disabled, disabledReason }`. `disabled` = `isRunning(status) || isCdkStack(resources)`; lý do: đang chạy → `RUNNING_EDIT_LOCK_REASON`, CDK → `CDK_EDIT_LOCK_REASON`.

- [ ] **Step 3: Kiểm tra**

Run: `cd web && npx tsc -b && npx oxlint && npx vitest run`
Expected: sạch, pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/services/cloudformation/pages
git commit -m "feat(cloudformation): Create stack and Edit template buttons"
```

### Task 4: E2E và tài liệu

**Files:**

- Create: `tests/e2e/cloudformation-templates.spec.ts`
- Modify: `README.md` (dòng CloudFormation trong bảng service: thêm "create or edit a stack from a YAML template")
- Modify: `docs/superpowers/specs/2026-11-19-cloudformation-design.md` (dòng trạng thái: 3.6 "đã làm"; kết quả 2 mục "Chưa kiểm" của 3.6)

**Interfaces:**

- Consumes: route và nhãn ở Task 2, 3; `uniqueName`, `test`, `expect`, `flash` của `e2e/fixtures.ts`; `consoleConfig`, `viaConsole` của `it/helpers.ts`. Stack `lc-e2e-*` được `it/leftovers.mjs` dọn sẵn; tự xóa trong `afterAll` bằng SDK.

- [ ] **Step 1: Viết E2E** (dán template bằng cách focus `.ace_text-input`, `Ctrl+A`, gõ; giống `e2e/sqs` dùng editor). Các test:
  - `create a stack from the starter template, then see it in Events and the queue exists`: Create stack → nhập tên → Deploy → URL `/cloudformation/stacks/<tên>` → thấy `CREATE_COMPLETE` của stack ở Events; SDK `ListStackResources` có `AWS::SQS::Queue` `CREATE_COMPLETE`.
  - `edit the template: add a resource and deploy an update`: Edit template → editor có `AWS::SQS::Queue` → thêm resource thứ hai → Deploy → Events có `UPDATE_COMPLETE`, Resources có 2 queue.
  - `deploying again with no change shows a notice and stays`: Edit template → Deploy không sửa → flash `No changes to deploy.`, URL vẫn `/edit`.
  - `bad YAML, an existing name or a parameter without a default shows the error under the editor and keeps the text`: 3 trường hợp, mỗi trường hợp thấy lỗi gốc của Floci dưới editor, nội dung editor còn nguyên, URL không đổi.
  - `a CDK stack cannot be edited here`: tạo bằng SDK stack có resource `AWS::CDK::Metadata` → trang stack, nút Edit template bị khóa, rê chuột thấy `CDK_EDIT_LOCK_REASON`.
  - `a stack deployed from a JSON file can be edited`: tạo bằng SDK với `TemplateBody` JSON → Edit template → Deploy thêm resource → `UPDATE_COMPLETE`.
  - `editing a stack that does not exist says not found`: mở `/cloudformation/stacks/lc-e2e-missing-x/edit` → "not found" + link về danh sách (dùng `test.use({ danglingProbes: true })` vì `GetTemplate` trả 400).

- [ ] **Step 2: Chạy**

Run: `docker compose up --build -d` rồi `cd tests && npx playwright test --project=e2e e2e/cloudformation-templates.spec.ts --repeat-each=2`
Expected: pass cả 2 lượt; `npm run leftovers -w tests` không còn stack `lc-e2e-*`.

- [ ] **Step 3: Kiểm 2 mục "Chưa kiểm" của 3.6** bằng script tạm (không commit): template có một Lambda nodejs lần đầu (kéo image) deploy qua trang — request có bị proxy cắt không; template ~60 KB — Floci trả gì. Ghi kết quả vào mục 7 của spec.

- [ ] **Step 4: Chạy toàn bộ**

Run: `npm run typecheck && npm run lint && npm test && npm run test:it -w tests && npm run test:e2e -w tests && npm run test:ui -w tests`
Expected: tất cả pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/cloudformation-templates.spec.ts README.md docs/superpowers/specs/2026-11-19-cloudformation-design.md
git commit -m "test(e2e): create and edit stacks from a YAML template; docs"
```
