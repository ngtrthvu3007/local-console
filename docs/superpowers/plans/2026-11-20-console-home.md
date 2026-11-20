# Console Home mới — Kế hoạch triển khai

> **Đã đổi sau khi làm (2026-11-20):** Task 4 (lưới thẻ) bị thay bằng thẻ Recently visited kiểu AWS; xem spec mục 3.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay bảng Services trên Home bằng lưới thẻ chia nhóm + dòng "Recently visited", thêm ô search service (phím `/`) trên thanh trên cùng.

**Architecture:** Hàm thuần (lọc service, cập nhật danh sách recent) tách riêng để unit test; hook `useRecentServices` bọc `localStorage`; `Layout` ghi recent khi đổi trang và gắn `ServiceSearch` vào slot `search` của `TopNavigation`; Home render `RecentServices` + `ServiceGrid` từ registry.

**Tech Stack:** React 19, Cloudscape (`TopNavigation`, `Autosuggest`), React Router, vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-20-console-home-design.md](../specs/2026-11-20-console-home-design.md)

## Global Constraints

- Không thêm package. Không lệnh git ghi (user tự commit): mỗi task kết thúc bằng báo "sẵn sàng commit" + message gợi ý, không attribution.
- Không hardcode: số recent tối đa `MAX_RECENT_SERVICES = 4`, key storage, phím `/`, bề rộng thẻ (biến CSS) đặt thành hằng số / biến CSS.
- Search chỉ khớp `name`, `fullName` (user chốt 2026-11-20), không phân biệt hoa thường.
- `localStorage` luôn trong try/catch như `web/src/shared/colorMode.ts`.
- Comment tiếng Việt, ngắn, giải thích _vì sao_.

## Review Focus

1. Gõ `/` trong input / textarea / CodeEditor (Ace) của trang khác → **không** được cướp focus. Test E2E: gõ `/` trong ô filter của Queues vẫn ra ký tự `/`.
2. `localStorage` chứa rác (không phải JSON, không phải mảng, id service đã gỡ) → Home vẫn render, recent bỏ mục lạ. Unit test `parseRecent`.
3. Enter khi gõ chữ không khớp service nào → không điều hướng, không lỗi console. E2E.
4. Đường dẫn không thuộc service (`/`, trang 404 `/s3x/…`) → không ghi recent. Unit test `serviceIdFromPath`.
5. Floci tắt → thẻ vẫn bấm được, số resource hiện "—". E2E Floci-down hiện có giữ nguyên + kiểm thẻ.

---

### Task 1: Hàm thuần cho search và recent

**Files:**

- Create: `web/src/shared/recentServices.ts`
- Test: `web/test/shared/recentServices.test.ts`

**Interfaces:**

- Produces:
  - `MAX_RECENT_SERVICES = 4`
  - `serviceIdFromPath(pathname: string, ids: readonly string[]): string | undefined` — đoạn đầu đường dẫn nếu là id service.
  - `pushRecent(recent: string[], id: string, max = MAX_RECENT_SERVICES): string[]` — đưa lên đầu, không trùng, cắt `max`.
  - `parseRecent(raw: string | null, ids: readonly string[]): string[]` — JSON mảng chuỗi, chỉ giữ id còn trong registry; rác → `[]`.
  - `matchServices<T extends { name: string; fullName: string }>(items: T[], text: string): T[]` — chứa chuỗi (trim, lowercase) trong `name` hoặc `fullName`; text rỗng → cả danh sách.

- [ ] **Step 1: Viết test fail**

```ts
const ids = ["s3", "sqs", "ses", "lambda", "sns"];
expect(serviceIdFromPath("/sqs/queues/a", ids)).toBe("sqs");
expect(serviceIdFromPath("/", ids)).toBeUndefined();
expect(serviceIdFromPath("/s3x/foo", ids)).toBeUndefined();
expect(pushRecent(["s3", "sqs"], "sqs")).toEqual(["sqs", "s3"]);
expect(pushRecent(["a", "b", "c", "d"], "e")).toEqual(["e", "a", "b", "c"]);
expect(parseRecent('["sqs","gone",1]', ids)).toEqual(["sqs"]);
expect(parseRecent("{bad", ids)).toEqual([]);
expect(parseRecent('{"a":1}', ids)).toEqual([]);
expect(parseRecent(null, ids)).toEqual([]);
const items = [
  { name: "SQS", fullName: "Amazon SQS" },
  { name: "SES", fullName: "Amazon SES" },
];
expect(matchServices(items, " sq ")).toEqual([items[0]]);
expect(matchServices(items, "amazon")).toEqual(items);
expect(matchServices(items, "")).toEqual(items);
```

- [ ] **Step 2:** `cd web && npx vitest run test/shared/recentServices.test.ts` → FAIL (module không có).
- [ ] **Step 3:** Viết các hàm trên trong `recentServices.ts` (không import registry để test chạy ở môi trường node).
- [ ] **Step 4:** Chạy lại → PASS.

### Task 2: Hook recent + ghi khi đổi trang

**Files:**

- Modify: `web/src/shared/recentServices.ts` (thêm hook), `web/src/shared/Layout.tsx`

**Interfaces:**

- Consumes: Task 1.
- Produces: `useRecentServices(): ServiceDefinition[]` (đọc, theo dõi thay đổi) và `useRecordRecentService(pathname: string): void` (ghi). Key storage `localconsole:recent-services`.

- [ ] **Step 1:** Hook đọc `parseRecent(localStorage.getItem(KEY), services.map(s => s.id))` map ra `ServiceDefinition`; ghi phát sự kiện nội bộ (vd `window.dispatchEvent(new Event(RECENT_EVENT))`) để Home cập nhật mà không reload. Dùng `useSyncExternalStore` (snapshot là chuỗi raw để so sánh ổn định).
- [ ] **Step 2:** `Layout`: gọi `useRecordRecentService(pathname)` (effect theo `pathname`).
- [ ] **Step 3:** `cd web && npm run typecheck` → không lỗi.

### Task 3: Ô search trên thanh trên cùng

**Files:**

- Create: `web/src/shared/components/ServiceSearch.tsx`
- Modify: `web/src/shared/Layout.tsx` (slot `search`), `web/src/shared/constants.ts` (`SEARCH_SHORTCUT_KEY = "/"`)
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `matchServices`, `useRecentServices`, `services`, `servicePath`, `useNavigate`.
- Produces: `<ServiceSearch />` (không prop).

- [ ] **Step 1: Test E2E fail**

```ts
test("search opens a service by name, '/' focuses it", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Search services" });
  await expect(search).toBeFocused();
  await search.fill("queue service"); // không khớp name/fullName
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await search.fill("sqs");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
});

test("'/' typed in a page field stays in the field", async ({ page }) => {
  await page.goto("/sqs/queues");
  const filter = page.getByRole("searchbox").first();
  await filter.fill("a/b");
  await expect(filter).toHaveValue("a/b");
});
```

- [ ] **Step 2:** Chạy `cd tests && LOCAL_CONSOLE_URL=http://localhost:5173 npx playwright test e2e/home.spec.ts` → FAIL.
- [ ] **Step 3:** `Autosuggest` (`ariaLabel="Search services"`, placeholder `Search services  /`, `filteringType="manual"`, `options` = nhóm "Recently visited" (khi ô trống và có recent) + "All services" / khi gõ: `matchServices` một nhóm). Option: `value = id`, `label = fullName`, `description` = `description`, `iconSvg` = `ServiceIcon`. `onSelect`: có `selectedOption` → đi tới service; không có → kết quả `matchServices` đầu tiên, không có thì thôi; xóa ô sau khi đi. Phím `/`: listener `keydown` trên `document`, bỏ qua khi `event.target` là input / textarea / `[contenteditable]` / trong `.ace_editor`, `preventDefault` rồi `ref.current?.focus()`.
- [ ] **Step 4:** Chạy lại → PASS. `npm run typecheck` sạch.

### Task 4: Lưới service + Recently visited trên Home

**Files:**

- Create: `web/src/pages/home/ServiceGrid.tsx`, `web/src/pages/home/RecentServices.tsx`
- Delete: `web/src/pages/home/ServicesTable.tsx`
- Modify: `web/src/pages/home/Home.tsx`, `web/src/shared/Layout.css`, `web/src/registry.ts` + 8 `web/src/services/*/index.tsx` (bỏ `quickLinks`)
- Test: `tests/e2e/home.spec.ts`, `tests/mobile/viewport.spec.ts` (nếu cần)

**Interfaces:**

- Consumes: `useRecentServices`, `RESOURCE_COUNTS`, `ServiceIcon`, `SERVICE_CATEGORIES`, `useFollow`, `pluralize`.
- Produces: `<ServiceGrid />`, `<RecentServices />`.

- [ ] **Step 1: Test E2E fail**

```ts
test("home groups services by category and a card opens its service", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Application integration" })).toBeVisible();
  await page.getByRole("link", { name: "Amazon SQS" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Recently visited" }).getByRole("link", { name: "SQS" }),
  ).toBeVisible();
});
```

Floci-down test hiện có: thêm assert thẻ Amazon S3 có "—".

- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** `ServiceGrid`: mỗi category (thứ tự `SERVICE_CATEGORIES`) có service → `h2` label + lưới `.console-service-grid` (`grid-template-columns: repeat(auto-fill, minmax(var(--service-card-min-width), 1fr))`). Thẻ `.console-service-card`: `ServiceIcon`, link `fullName` có `::after` phủ cả thẻ, `description`, số resource (tách component `ResourceCount` giữ logic của `ResourceCountCell` cũ). Hover / `:focus-within` → viền nổi theo token. `RecentServices`: `<nav aria-label="Recently visited">`, chip link (icon + `name`), trả `null` khi rỗng. Home: cột chính `RecentServices` + `ServiceGrid`, cột phải `FlociCard` + `ConnectYourApp`. Bỏ `quickLinks` khỏi `ServiceDefinition` và 8 service.
- [ ] **Step 4:** E2E home → PASS; `npm run typecheck`, `npm test` (web) sạch.

### Task 5: Kiểm toàn bộ

- [ ] Chạy unit (web + server), IT (port 3701), E2E / UI / UX / mobile với `LOCAL_CONSOLE_URL=http://localhost:5173` → tất cả PASS.
- [ ] Playwright MCP: chụp Home 1440, 1024, 390px, sáng và tối; không cuộn ngang; search thu thành nút trên điện thoại.
- [ ] Cập nhật README (Home) và roadmap nếu nhắc bảng Services.
- [ ] `/ponytail-review` trên diff; báo user sẵn sàng commit kèm message gợi ý.
