# CloudWatch Logs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang CloudWatch Logs xem log của các service đang chạy trên Floci (Lambda, task ECS, RDS, DocumentDB, ElastiCache, Amazon MQ, app):

- Tạo / sửa retention / xóa log group.
- Search theo filter pattern, xem stream.
- Send test event.
- Subscription filter tới Lambda / Kinesis.
- Link hai chiều với các service đó.

**Architecture:**

- Phần đọc log của Lambda tách ra `web/src/shared/logs/`; Lambda › Monitor, task ECS › Logs và trang mới cùng dùng.
- Service mới `web/src/services/logs/` theo khuôn DocumentDB / Kinesis: `routes.ts`, `constants.ts`, `schemas.ts`, hàm thuần `sources.ts`, hooks TanStack Query, trang `lazyPage`. Thêm một dòng trong `registry.ts`.
- Gọi Floci bằng `@aws-sdk/client-cloudwatch-logs` (đã có) qua proxy `/aws`.
- **Không sửa server, không cài package.**

**Tech Stack:** React 19, Cloudscape, react-hook-form + zod (`useZodForm`), TanStack Query v5, `@aws-sdk/client-cloudwatch-logs`, `DecompressionStream` (trình duyệt / Node), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-cloudwatch-logs-design.md` (bản sửa duyệt 2026-11-26). Đọc mục 2, 3, 5, 7 trước khi làm.

## Global Constraints

**Quy tắc chung**

- **Không cài package, không chạy git ghi** (CLAUDE.md). Bước "Commit" của mỗi task là báo file đã sửa để user tự commit.
- Bundle (development.md › Traps):
  - `@aws-sdk/client-cloudwatch-logs` chỉ được import trong `shared/logs/` và hooks / components / pages của service.
  - Không import SDK đó trong `registry.ts`, `services/logs/{index.tsx,routes.ts,constants.ts,schemas.ts,sources.ts}`, `shared/` ngoài `shared/logs/`.
  - `shared/logs/` không được import từ `Layout` / `registry.ts`.
- `shared/` không import từ `services/`.
- Code theo CLAUDE.md:
  - Hằng số có tên; comment tiếng Việt ngắn nói lý do; hạn chế type assertion.
  - Dùng lại `shared/`: `BulkActionModal`, `FormModal`, `useZodForm`, `useTabParam`, `withQuery`, `pageState`, `StackLink`, `copyable`, `EmptyState`, `emptyOrError`, `ActionBar`, `refreshAction`, `runEach`, `notifyOutcome`.
  - Hàm route **không** nhận tham số tab khi chưa có caller truyền vào.
  - Sau khi code: `npm run typecheck`, `npm run lint`, `npx prettier --check`, `/ponytail-review`.

**Route và sidebar**

- Route: `/logs/groups`, `/logs/groups/detail?group=<tên>&tab=search|streams|subscription-filters` (Search mặc định, không ghi lên URL), `/logs/groups/stream?group=&stream=`.
- Sidebar **Log groups**; service id `logs`; tên "CloudWatch Logs", fullName "Amazon CloudWatch Logs"; nhóm `management`; icon Tabler `IconLogs`.

**Luật AWS (Floci nhận cả giá trị sai nên form tự chặn)**

- Log group name: 1–512 ký tự, `/^[A-Za-z0-9._\-/#]+$/`.
- Log stream name: 1–512, không `:` và `*` (`/^[^:*]+$/`).
- Subscription filter name: 1–512, `/^[^:*]+$/`; filter pattern ≤ 1024 ký tự.
- Retention: `"never"` (Never expire) hoặc một trong `RETENTION_DAYS = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653]`.

**Tên group của service khác** (hằng số / hàm đặt ở `constants.ts` của service đó, cạnh `errorLogGroup` sẵn có của RDS):

| Service     | Tên group                                  | Ghi chú                        |
| ----------- | ------------------------------------------ | ------------------------------ |
| Lambda      | `/aws/lambda/<fn>`                         | `LOG_GROUP_PREFIX` đã có       |
| RDS         | `/aws/rds/instance/<id>/error`             |                                |
| DocumentDB  | `/aws/docdb/cluster/<id>/audit`            |                                |
| ElastiCache | `/aws/elasticache/cluster/<id>/engine-log` | `<id>` là `ReplicationGroupId` |
| Amazon MQ   | `/aws/amazonmq/broker/<brokerId>/general`  |                                |

**Không gọi API dễ gây 400** (400 làm trình duyệt ghi `console.error`)

- Group chưa có: kiểm bằng `DescribeLogGroups` theo prefix rồi so khớp đúng tên, không gọi API theo tên trước.
- Stream chưa có: kiểm bằng `DescribeLogStreams` trước, không `CreateLogStream` mù.

**Subscription filter:** không gọi `AddPermission`, không gửi `roleArn`.

**Mô tả cố định (tiếng Anh)**

- Ô filter: "Filter pattern, e.g. ERROR or { $.level = "ERROR" }".
- Send test event: "Matching subscription filters deliver this event too."
- Đích Lambda: "Lambda receives matching events base64-encoded and gzipped in `event.awslogs.data`."
- Đích Kinesis: "Each record is gzipped JSON; the Kinesis Data viewer shows it decompressed."

## Review Focus

1. **Tên group / stream có ký tự đặc biệt** (`/`, `#`, `[$LATEST]`, `$`) đi qua URL rồi đọc lại phải ra đúng tên → test route round trip (Task 2).
2. **Group chưa có hoặc vừa xóa**: Search / trang chi tiết / trang stream báo trống hoặc "not found", không có `console.error` → E2E (Task 7).
3. **Send test event hai lần vào cùng stream mới**: lần đầu tạo stream, lần sau ghi tiếp, không 400 → IT (Task 4).
4. **Retention**: chọn "Never expire" khi sửa → `DeleteRetentionPolicy`; giá trị ngoài `RETENTION_DAYS` bị schema chặn → unit (Task 2) + IT (Task 3).
5. **Data viewer của Kinesis**: record thường (JSON / text / binary) hiện như cũ; record gzip hiện nội dung đã giải nén; gzip hỏng giữ nguyên byte → unit (Task 5).

---

## File Structure

```text
web/src/shared/logs/
├── constants.ts          # LOGS_QUERY_ROOT, LOG_RANGES, DEFAULT_LOG_RANGE, LOG_REFRESH_INTERVAL_MS (Task 1)
├── format.ts             # logMessageText (Task 1)
├── useLogsClient.ts      # useLogsClient (Task 1)
├── useLogEvents.ts       # logGroupExists, useLogEvents (Task 1)
└── LogEvents.tsx         # Search dùng chung (Task 1)
web/src/services/logs/
├── index.tsx (Task 3), routes.ts, constants.ts, schemas.ts, sources.ts (Task 2)
├── hooks/useLogGroups.ts (Task 3), useLogStreams.ts, useStreamEvents.ts, useSendTestEvent.ts (Task 4),
│   useSubscriptionFilters.ts (Task 5)
├── pages/LogGroupList.tsx (Task 3), LogGroupDetail.tsx, LogStream.tsx (Task 4)
└── components/CreateLogGroupModal.tsx, DeleteLogGroupsModal.tsx, RetentionSelect (Task 3);
    EditRetentionModal.tsx, SendTestEventModal.tsx, StreamsTab.tsx (Task 4);
    SubscriptionFiltersTab.tsx, CreateSubscriptionFilterModal.tsx (Task 5)
web/test/shared/logs/format.test.ts (Task 1) · web/test/services/logs/logs.test.ts (Task 2)
web/test/services/kinesis/recordData.test.ts (Task 5, có sẵn thì thêm vào)
tests/it/logs.test.ts (Task 3–5) · tests/e2e/logs.spec.ts (Task 7)
```

---

### Task 1: Tách phần đọc log ra `shared/logs/`

Refactor, không đổi hành vi. Lưới an toàn là test hiện có: `tests/e2e/sqs-flows.spec.ts`, `tests/e2e/ecs.spec.ts`, ảnh chụp `tests/ux`, `tests/mobile`.

**Files:**

- Create: `web/src/shared/logs/constants.ts`, `format.ts`, `useLogsClient.ts`, `useLogEvents.ts`, `LogEvents.tsx`; test `web/test/shared/logs/format.test.ts`
- Modify:
  - `web/src/services/lambda/constants.ts`: bỏ `LOG_RANGES`, `LogRangeId`, `DEFAULT_LOG_RANGE`, `LOG_REFRESH_INTERVAL_MS`; giữ `LOG_CLOCK_SKEW_MS`, `LOG_GROUP_PREFIX`.
  - `lambda/helpers.ts`: bỏ `logMessageText`.
  - `lambda/components/MonitorTab.tsx`.
  - `lambda/hooks/useFunctionLogs.ts`: xóa file, `useFunctions.ts` import `logGroupExists` từ shared.
  - `lambda/hooks/useInvoke.ts`, `lambda/hooks/useLambda.ts`.
  - `ecs/hooks/useTaskLogs.ts`, `ecs/components/TaskLogsTab.tsx`.

**Interfaces:**

- Produces (`constants.ts`):
  - `LOGS_QUERY_ROOT = "logs"`.
  - `LOG_RANGES`, `LogRangeId`, `DEFAULT_LOG_RANGE`, `LOG_REFRESH_INTERVAL_MS`: giữ nguyên giá trị.
- Produces (`format.ts`): `logMessageText(message?: string): string`, giữ nguyên.
- Produces (`useLogsClient.ts`): `useLogsClient(): CloudWatchLogsClient`, tạo bằng `useAwsClient(CloudWatchLogsClient)`.
- Produces (`useLogEvents.ts`):
  - `logGroupExists(client: CloudWatchLogsClient, name: string): Promise<boolean>`.
  - `interface LogEventsOptions { rangeId: LogRangeId; filterPattern: string; autoRefresh: boolean }`.
  - `useLogEvents(logGroupName: string, options: LogEventsOptions)`: query key `[LOGS_QUERY_ROOT, "events", logGroupName, rangeId, filterPattern]`; trả `FilteredLogEvent[]` mới nhất trên.
- Produces (`LogEvents.tsx`):
  - `LogEvents({ logGroupName, title, description, filterPlaceholder, empty, streamHref? }: { logGroupName: string; title: string; description?: ReactNode; filterPlaceholder: string; empty: ReactNode; streamHref?: (stream: string) => string })`.
  - Header, nút Refresh, SegmentedControl, Toggle, bảng giữ đúng như `MonitorTab` hiện tại.
  - Có `streamHref` thì cột Log stream là `Link` (`useFollow`).
  - Bảng message export thêm `logEventColumns` (Timestamp, Message) để ECS và trang stream dùng lại.
- Lambda › Monitor sau khi đổi: `MonitorTab({ functionName, logGroup })` render `<LogEvents title='Log events' description={`Log group ${logGroup}`} filterPlaceholder='Filter events, e.g. ERROR' empty={…text cũ…} />`. Chữ và bố cục không đổi.

- [ ] **Step 1: Viết test** `web/test/shared/logs/format.test.ts`:

  ```ts
  it("keeps line breaks of a log message and drops trailing whitespace", () => {
    expect(logMessageText("a\r\nb\rc\n")).toBe("a\nb\nc");
    expect(logMessageText(undefined)).toBe("");
  });
  ```

- [ ] **Step 2: Chạy, thấy fail:** `npm test -w web -- shared/logs` → FAIL (module không có).
- [ ] **Step 3: Chuyển code** theo Interfaces (chuyển nguyên, chỉ đổi chỗ import); Lambda và ECS import từ `@shared/logs/…`.
- [ ] **Step 4: Chạy:**
  - `npm test -w web` → PASS.
  - `npm run typecheck`, `npm run lint` → 0 lỗi.
  - `grep -rn "lambda/" web/src/services/ecs` → không còn import chéo từ Lambda.
- [ ] **Step 5: Kiểm không đổi hành vi:**
  - `docker compose up --build -d console`.
  - `LOCAL_CONSOLE_URL=http://127.0.0.1:3701 npm run test:e2e -w tests -- sqs-flows ecs` → PASS.
  - `npm run test:ux -w tests` → PASS (ảnh Monitor không đổi).
- [ ] **Step 6: Báo file cho user commit.**

### Task 2: Hàm thuần, hằng số, schema, routes, nguồn log

**Files:**

- Create: `web/src/services/logs/constants.ts`, `routes.ts`, `schemas.ts`, `sources.ts`; test `web/test/services/logs/logs.test.ts`
- Modify (thêm hằng số tên group, xem Global Constraints):
  - `web/src/services/rds/constants.ts`: `RDS_LOG_GROUP_PREFIX`, `errorLogGroup` dùng nó.
  - `docdb/constants.ts`: `DOCDB_LOG_GROUP_PREFIX`, `auditLogGroup(id)`.
  - `elasticache/constants.ts`: `ELASTICACHE_LOG_GROUP_PREFIX`, `engineLogGroup(id)`.
  - `mq/constants.ts`: `MQ_LOG_GROUP_PREFIX`, `brokerLogGroup(brokerId)`.

**Interfaces:**

- Produces (`constants.ts`):
  - `RETENTION_DAYS` (Global Constraints) `as const`; `NEVER_EXPIRE = "never"`.
  - `RETENTION_OPTIONS: { value: string; label: string }[]`, gồm "Never expire" rồi tới "1 day", "3 days"…
  - `retentionLabel(days?: number): string`: `undefined` → "Never expire", `1` → "1 day", `n` → "n days".
  - `DEFAULT_TEST_STREAM = "console-test"`; các câu mô tả cố định.
- Produces (`schemas.ts`):
  - `createLogGroupSchema` → `{ name: string; retention: string }`.
  - `retentionSchema` → `{ retention: string }`.
  - `testEventSchema` → `{ stream: string; message: string }` (message bắt buộc, trim không rỗng).
  - `subscriptionFilterSchema` → `{ name: string; filterPattern: string; destinationType: "lambda" | "kinesis"; destinationArn: string }` (ARN bắt buộc).
  - Helper `retentionDays(value: string): number | undefined`: `"never"` → `undefined`.
- Produces (`routes.ts`):
  - `LOGS_SERVICE_ID = "logs"`.
  - `LOGS_ROUTE_PATTERNS = { groups: "groups", group: "groups/detail", stream: "groups/stream" }`.
  - `SEARCH_PARAMS = { group: "group", stream: "stream" }`.
  - `GROUP_TABS = { search: "search", streams: "streams", subscriptions: "subscription-filters" }`.
  - `logsRoutes = { groups, group(name: string), stream(group: string, stream: string) }`, dùng `withQuery`.
  - `logsBaseCrumbs` ("Amazon CloudWatch Logs", "Log groups"), `groupCrumbs(name)`.
- Produces (`sources.ts`): `logSourceOf(group: string): { label: "Function" | "Database" | "Cluster" | "Broker"; name: string; href: string } | undefined`.
  - Bảng prefix → route: Lambda `lambdaRoutes.function`, RDS `rdsRoutes.database`, DocumentDB `docdbRoutes.cluster`, ElastiCache `elasticacheRoutes.cluster`, Amazon MQ `mqRoutes.broker`.
  - Lambda: phần sau prefix là tên function. Các service còn lại: đoạn đầu tiên sau prefix.

- [ ] **Step 1: Viết test thất bại** `web/test/services/logs/logs.test.ts`:

  ```ts
  it("round-trips group and stream names with special characters through the URL", () => {
    const group = "/aws/lambda/my-fn#1";
    const stream = "2026/11/26/[$LATEST]1a2b";
    const url = new URL(logsRoutes.stream(group, stream), "http://x");
    expect(url.pathname).toBe("/logs/groups/stream");
    expect(url.searchParams.get("group")).toBe(group);
    expect(url.searchParams.get("stream")).toBe(stream);
    expect(logsRoutes.group("/my-app/api")).toBe("/logs/groups/detail?group=%2Fmy-app%2Fapi");
  });
  it("finds the console page of a service log group from its name only", () => {
    expect(logSourceOf("/aws/lambda/process-order")).toEqual({
      label: "Function",
      name: "process-order",
      href: "/lambda/functions/process-order",
    });
    expect(logSourceOf("/aws/rds/instance/app-db/error")?.href).toBe("/rds/databases/app-db");
    expect(logSourceOf("/aws/docdb/cluster/orders/audit")?.href).toBe("/docdb/clusters/orders");
    expect(logSourceOf("/aws/elasticache/cluster/app-cache/engine-log")?.href).toBe(
      "/elasticache/clusters/app-cache",
    );
    expect(logSourceOf("/aws/amazonmq/broker/b-123/general")?.name).toBe("b-123");
    expect(logSourceOf("/my-app/api")).toBeUndefined();
    expect(errorLogGroup("app-db")).toBe("/aws/rds/instance/app-db/error");
    expect(auditLogGroup("orders")).toBe("/aws/docdb/cluster/orders/audit");
    expect(engineLogGroup("app-cache")).toBe("/aws/elasticache/cluster/app-cache/engine-log");
    expect(brokerLogGroup("b-123")).toBe("/aws/amazonmq/broker/b-123/general");
  });
  it("only allows AWS retention values and labels them", () => {
    expect(createLogGroupSchema.safeParse({ name: "/my-app/api", retention: "7" }).success).toBe(
      true,
    );
    expect(createLogGroupSchema.safeParse({ name: "/my-app/api", retention: "8" }).success).toBe(
      false,
    );
    expect(retentionDays("never")).toBeUndefined();
    expect(retentionDays("14")).toBe(14);
    expect([retentionLabel(undefined), retentionLabel(1), retentionLabel(7)]).toEqual([
      "Never expire",
      "1 day",
      "7 days",
    ]);
  });
  it("checks AWS names Floci doesn't", () => {
    for (const name of ["", "has space", "bad:colon", "x".repeat(513)])
      expect(createLogGroupSchema.safeParse({ name, retention: "never" }).success).toBe(false);
    expect(testEventSchema.safeParse({ stream: "a:b", message: "hi" }).success).toBe(false);
    expect(testEventSchema.safeParse({ stream: "console-test", message: "  " }).success).toBe(
      false,
    );
    expect(
      subscriptionFilterSchema.safeParse({
        name: "f*",
        filterPattern: "",
        destinationType: "lambda",
        destinationArn: "arn:x",
      }).success,
    ).toBe(false);
  });
  ```

- [ ] **Step 2: Chạy, thấy fail:** `npm test -w web -- services/logs` → FAIL.
- [ ] **Step 3: Viết các file** theo Interfaces.
- [ ] **Step 4: Chạy:** `npm test -w web` → PASS; `npm run typecheck` → 0 lỗi.
- [ ] **Step 5: Báo file cho user commit.**

### Task 3: Service, danh sách log group (tạo / xóa), dọn test

**Files:**

- Create: `web/src/services/logs/index.tsx`, `hooks/useLogGroups.ts`, `pages/LogGroupList.tsx`, `components/CreateLogGroupModal.tsx`, `components/DeleteLogGroupsModal.tsx`; `tests/it/logs.test.ts`
- Modify: `web/src/registry.ts` (sau `cloudformationService`), `tests/it/leftovers.mjs`, `tests/ui/responsive.spec.ts` (`logs-groups` → `/logs/groups`)

**Interfaces:**

- Consumes: Task 1 `useLogsClient`, `LOGS_QUERY_ROOT`; Task 2 `logsRoutes`, `createLogGroupSchema`, `retentionDays`, `retentionLabel`, `RETENTION_OPTIONS`.
- Produces (`hooks/useLogGroups.ts`):
  - `useLogGroups(prefix: string)`: `DescribeLogGroups` theo `logGroupNamePrefix`, vòng `nextToken`; key `[LOGS_QUERY_ROOT, "groups", prefix]`.
  - `useLogGroup(name: string)`: `{ ...query, data: LogGroup | null | undefined }`; dò trong `useLogGroups(name)`, so khớp đúng tên; `null` là không có.
  - `useCreateLogGroup()`: `CreateLogGroup`, rồi `PutRetentionPolicy` khi có số ngày; trả `name`.
  - `useDeleteLogGroups()`: `runEach` → `DeleteLogGroup`.
  - `usePutRetention(name)`: `PutRetentionPolicy`, hoặc `DeleteRetentionPolicy` khi `undefined`.
  - Mọi mutation invalidate `[LOGS_QUERY_ROOT]`.
- Produces (`CreateLogGroupModal`): `RetentionSelect` (`FormSelect` với `RETENTION_OPTIONS`) để `EditRetentionModal` ở Task 4 dùng lại.
- Danh sách:
  - Ô lọc prefix là `TextFilter`, gõ xong mới tải (`onDelayedChange`).
  - Cột Log group (link `logsRoutes.group`), Retention (`retentionLabel`), Stored bytes (`formatBytes` của `@shared/format.ts`), Created.
  - Khung hẹp 2 tầng.
  - Create xong mở trang chi tiết.
- `leftovers.mjs`: thêm `logGroups` = `DescribeLogGroups` (vòng `nextToken`), giữ group có tên chứa một trong `PREFIXES`; in ra; `--delete` thì `DeleteLogGroup`.

- [ ] **Step 1: Viết IT thất bại** `tests/it/logs.test.ts`, qua `viaConsole`, group `/lc-it-logs-<…>`:
  - `"creates a log group with retention, changes it to never expire and deletes it"`:
    - `CreateLogGroup` + `PutRetentionPolicy(7)` → `DescribeLogGroups` có `retentionInDays: 7`.
    - `DeleteRetentionPolicy` → `retentionInDays` là `undefined`.
    - `DeleteLogGroup` → không còn trong danh sách.
  - `"accepts a retention AWS rejects"` (ghi lại lệch AWS, spec 7 #2): `PutRetentionPolicy(8)` resolves.
- [ ] **Step 2: Chạy:** `LOCAL_CONSOLE_URL=http://127.0.0.1:3701 npm run test:it -w tests -- logs` → PASS. IT ghi lại hành vi Floci nên pass ngay; nếu fail thì Floci đã đổi, dừng lại và báo.
- [ ] **Step 3: Viết hooks, trang, modal, `index.tsx`, dòng registry, `leftovers.mjs`, dòng responsive.**
- [ ] **Step 4: Chạy:**
  - `npm test -w web`, `npm run typecheck`, `npm run lint` → sạch.
  - `node tests/it/leftovers.mjs` → in danh sách log group test (khoảng 550).
  - `node tests/it/leftovers.mjs --delete` → in lại thì còn 0 group `lc-*`.
- [ ] **Step 5: Báo file cho user commit.**

### Task 4: Chi tiết log group, Search, Streams, trang stream, Send test event

**Files:**

- Create:
  - `web/src/services/logs/pages/LogGroupDetail.tsx`, `pages/LogStream.tsx`.
  - `hooks/useLogStreams.ts`, `hooks/useStreamEvents.ts`, `hooks/useSendTestEvent.ts`.
  - `components/EditRetentionModal.tsx`, `components/SendTestEventModal.tsx`, `components/StreamsTab.tsx`.
- Modify: `index.tsx` (route `group`, `stream`), `tests/it/logs.test.ts`, `tests/ui/responsive.spec.ts` (`logs-group` → `/logs/groups/detail?group=/aws/lambda/x`, trang not found cũng phải không cuộn ngang)

**Interfaces:**

- Consumes: Task 1 `LogEvents`, `logEventColumns`, `logGroupExists`; Task 2 `logSourceOf`, `GROUP_TABS`, `SEARCH_PARAMS`, `testEventSchema`, `DEFAULT_TEST_STREAM`; Task 3 `useLogGroup`, `usePutRetention`, `RetentionSelect`, `DeleteLogGroupsModal`.
- Produces:
  - `useLogStreams(group)`: `DescribeLogStreams` `orderBy: "LastEventTime"`, `descending: true`, vòng `nextToken`.
  - `useStreamEvents(group, stream, autoRefresh)`:
    - Kiểm group + stream bằng `DescribeLogStreams` (`logStreamNamePrefix`, so khớp đúng tên); không có thì `null`.
    - Có thì `GetLogEvents` (`startFromHead: false`), trả `{ events (mới nhất trên), loadOlder(), hasOlder }`.
    - Load older đi theo `nextBackwardToken`, dừng khi token lặp lại.
  - `useSendTestEvent(group)`: `({ stream, message }) =>` `DescribeLogStreams`, thiếu thì `CreateLogStream`, rồi `PutLogEvents({ timestamp: Date.now(), message })`; invalidate `[LOGS_QUERY_ROOT]`.
- Trang chi tiết:
  - Header: retention, dung lượng, ngày tạo, link nguồn (`logSourceOf`, tách bằng `DETAIL_SEPARATOR`), `<StackLink type='AWS::Logs::LogGroup' physicalId={name} separated />`.
  - ActionBar: Refresh, Delete (xong về danh sách), Edit retention, Send test event (primary).
  - Tabs qua `useTabParam(GROUP_TABS, GROUP_TABS.search, [SEARCH_PARAMS.group])`.
  - Tab Search là `LogEvents` với `streamHref`.
  - Không có group thì `pageState` → "Log group <tên> not found".
- Trang stream: tiêu đề `<group> › <stream>`; Refresh, Auto refresh; bảng `logEventColumns`; nút Load older events; không có thì "Log stream <tên> not found".

- [ ] **Step 1: Viết IT** (thêm vào `tests/it/logs.test.ts`):
  - `"finds events by text and JSON filter patterns"`: ghi `ERROR boom` và `{"level":"ERROR","code":500}` → `FilterLogEvents` với `ERROR` thấy cả hai; `{ $.code >= 500 }` chỉ thấy dòng JSON.
  - `"sends a test event twice to a new stream without an error"`: làm đúng chuỗi lời gọi của `useSendTestEvent` hai lần (lần hai không `CreateLogStream`) → `GetLogEvents` có 2 event.
  - `"lists streams with the latest event first"`.
- [ ] **Step 2: Chạy IT** → PASS (hành vi Floci; fail thì dừng, báo).
- [ ] **Step 3: Viết hooks, trang, modal, tab.**
- [ ] **Step 4: Chạy:**
  - `npm test -w web`, `npm run typecheck`, `npm run lint` → sạch.
  - Rebuild Docker; `npm run test:ui -w tests -- -g logs` → PASS.
- [ ] **Step 5: Báo file cho user commit.**

### Task 5: Subscription filter (Lambda / Kinesis) và Data viewer của Kinesis

**Files:**

- Create: `web/src/services/logs/hooks/useSubscriptionFilters.ts`, `components/SubscriptionFiltersTab.tsx`, `components/CreateSubscriptionFilterModal.tsx`
- Modify: `LogGroupDetail.tsx` (tab thứ ba), `web/src/services/kinesis/recordData.ts`, `kinesis/hooks/useRecords.ts`, `tests/it/logs.test.ts`
- Test: `web/test/services/kinesis/recordData.test.ts`

**Interfaces:**

- Consumes: Task 2 `subscriptionFilterSchema`; `useFunctions` (Lambda), `useStreams` (Kinesis: `StreamRow { name; arn }`); `lambdaRoutes.function`, `kinesisRoutes.stream`, `functionNameOfArn`, `streamNameOfArn`.
- Produces:
  - `useSubscriptionFilters(group)`.
  - `usePutSubscriptionFilter(group)`: `PutSubscriptionFilter({ logGroupName, filterName, filterPattern, destinationArn })`.
  - `useDeleteSubscriptionFilters(group)`: `runEach` → `DeleteSubscriptionFilter`.
  - `destinationOf(arn: string): { kind: "lambda" | "kinesis" | "other"; name: string }`, đặt trong `services/logs/sources.ts`, có unit test.
- Produces (`kinesis/recordData.ts`): `gunzipIfGzip(data: Uint8Array): Promise<Uint8Array>`.
  - Hai byte đầu là `0x1f 0x8b` thì giải nén bằng `DecompressionStream("gzip")`.
  - Giải nén lỗi hoặc không phải gzip thì trả nguyên `data`.
  - `useRecords` gọi hàm này cho `Data` của từng record trong `mutationFn` trước khi trả trang. `recordText` giữ nguyên.

- [ ] **Step 1: Viết test thất bại** `web/test/services/kinesis/recordData.test.ts`:

  ```ts
  import { gzipSync } from "node:zlib";
  it("decompresses gzip records and leaves other bytes alone", async () => {
    const json = '{"logEvents":[{"message":"ERROR boom"}]}';
    const gz = new Uint8Array(gzipSync(json));
    expect(new TextDecoder().decode(await gunzipIfGzip(gz))).toBe(json);
    const plain = new TextEncoder().encode('{"a":1}');
    expect(await gunzipIfGzip(plain)).toBe(plain);
    const broken = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);
    expect(await gunzipIfGzip(broken)).toBe(broken);
  });
  it("names the destination of a subscription filter from its ARN", () => {
    expect(destinationOf("arn:aws:lambda:ap-southeast-1:000000000000:function:alert")).toEqual({
      kind: "lambda",
      name: "alert",
    });
    expect(destinationOf("arn:aws:kinesis:ap-southeast-1:000000000000:stream/app-logs")).toEqual({
      kind: "kinesis",
      name: "app-logs",
    });
    expect(destinationOf("arn:aws:firehose:x:0:deliverystream/d").kind).toBe("other");
  });
  ```

- [ ] **Step 2: Chạy, thấy fail:** `npm test -w web -- recordData logs` → FAIL.
- [ ] **Step 3: Viết IT** (thêm vào `tests/it/logs.test.ts`; tạo Lambda bằng `zipSync` như `it/service-flow.test.ts`; Kinesis client có `requestHandler: new NodeHttpHandler()` như `it/kinesis.test.ts`):
  - `"delivers matching events to a Lambda subscription filter"`:
    - Handler giải nén `event.awslogs.data` rồi `console.log` message.
    - Filter `ERROR`; ghi `ERROR to lambda` và `INFO skip`.
    - `waitFor` log group của Lambda có `ERROR to lambda`, không có `INFO skip`.
  - `"delivers matching events to a Kinesis stream as gzipped JSON"`: `GetRecords` → `gunzipSync` → `logEvents[].message` chỉ có dòng khớp.
  - `"allows a third subscription filter or not"`: ghi lại kết quả thật vào test và spec 7 (mục chưa kiểm).
- [ ] **Step 4: Viết hook, tab, modal, `gunzipIfGzip`, sửa `useRecords`.**
  - Modal: Destination type là `Tiles` hoặc `RadioGroup`; Destination là `FormSelect` (danh sách function / stream).
  - Mô tả theo loại đích (Global Constraints).
- [ ] **Step 5: Chạy:** `npm test -w web` → PASS; IT `logs` → PASS; typecheck, lint sạch.
- [ ] **Step 6: Báo file cho user commit.**

### Task 6: Link từ service khác vào trang Logs

**Files:**

- Modify:
  - `web/src/shared/logs/LogEvents.tsx`: prop `actions?: ReactNode` để Monitor gắn nút.
  - `lambda/components/MonitorTab.tsx`.
  - `ecs/components/TaskLogsTab.tsx`.
  - `rds/components/DatabaseTabs.tsx` (`LogsTab`).
  - `docdb/components/ConnectivityTab.tsx` (Endpoints).
  - `elasticache/components/DetailsTab.tsx`, `mq/components/DetailsTab.tsx` (general items).
  - `cloudformation/resourceLinks.ts`: bỏ `LAMBDA_LOG_GROUP_PREFIX`.
- Test: unit `resourceLinks` trong `web/test/services/cloudformation/cloudformation.test.ts` (thêm case); E2E sẵn có: `tests/e2e/ecs.spec.ts`, `docdb.spec.ts`, `elasticache.spec.ts`, `mq.spec.ts`, `rds.spec.ts`

**Interfaces:**

- Consumes: Task 2 `logsRoutes.group`, `logsRoutes.stream`, các hàm tên group.
- Link dùng `Link` của Cloudscape + `useFollow`. Chữ hiện:
  - Lambda / ECS: "View in CloudWatch Logs" (`external={false}`, nằm trong header actions).
  - RDS / DocumentDB / ElastiCache / Amazon MQ: mục "Log group" có giá trị là link tên group. RDS giữ nút copy cạnh link.
- `resourceLinks`: `"AWS::Logs::LogGroup": (id) => logsRoutes.group(id)`.

- [ ] **Step 1: Viết test thất bại:**
  - Unit `resourceLinks`: `AWS::Logs::LogGroup` với `/aws/lambda/fn` và `/my-app/api` → `/logs/groups/detail?group=…`.
  - Thêm một assert vào mỗi E2E sẵn có, ở chỗ trang chi tiết đã mở:

    ```ts
    await expect(page.getByRole("link", { name: "View in CloudWatch Logs" })).toHaveAttribute(
      "href",
      `/logs/groups/stream?${new URLSearchParams({ group: logGroup, stream })}`,
    ); // ecs.spec, tab Logs của task
    await expect(
      page.getByRole("link", { name: `/aws/docdb/cluster/${cluster}/audit` }),
    ).toHaveAttribute(
      "href",
      `/logs/groups/detail?${new URLSearchParams({ group: `/aws/docdb/cluster/${cluster}/audit` })}`,
    ); // tương tự rds (error), elasticache (engine-log), mq (general, theo broker ID)
    ```

- [ ] **Step 2: Chạy, thấy fail:** unit → FAIL; E2E (sau rebuild Docker) các assert mới → FAIL.
- [ ] **Step 3: Sửa các file** theo Interfaces.
- [ ] **Step 4: Chạy:** `npm test -w web` → PASS; rebuild Docker; `npm run test:e2e -w tests -- ecs docdb elasticache mq rds sqs-flows` → PASS.
- [ ] **Step 5: Báo file cho user commit.**

### Task 7: E2E, kiểm giao diện, tài liệu

**Files:**

- Create: `tests/e2e/logs.spec.ts`
- Modify:
  - `docs/development.md` (Traps: mục CloudWatch Logs, gồm lệch AWS ở spec 7 #2, giới hạn 20.000 event, EventBridge → log group không chạy, group của Amazon MQ không dọn theo tên).
  - Spec (Kết quả thử, kết quả filter thứ ba).
  - `docs/superpowers/roadmap.md` (CloudWatch Logs: đã làm).
  - `README.md` (dòng CloudWatch Logs, nhóm Management).

- [ ] **Step 1: Viết E2E** (`lc-e2e-*`, `test.describe.configure({ mode: "serial" })`; Lambda và Kinesis stream tạo bằng SDK trong `beforeAll`, dọn trong `afterAll`):
  1. Create log group `/lc-e2e-logs-…` retention 7 days → danh sách hiện "7 days" → chi tiết → Edit retention "Never expire" → header hiện "Never expire".
  2. Send test event `ERROR boom` (stream mặc định) → tab Search thấy dòng → gõ `ERROR` vẫn thấy; Send test event `{"level":"ERROR"}` → pattern `{ $.level = "ERROR" }` chỉ thấy dòng JSON.
  3. Tab Log streams → `console-test` → trang stream thấy cả hai event.
  4. Tạo subscription filter `ERROR` → Lambda → Send test event → `waitFor` log của Lambda có message (SDK).
  5. Tạo subscription filter → Kinesis → Send test event → Kinesis › Data viewer (Trim horizon, Get records) thấy `logEvents` và message (JSON đã giải nén, không phải "Binary").
  6. Lambda › Monitor của function: "View in CloudWatch Logs" mở đúng group; header group có "Function: <fn>" về lại trang function.
  7. Xóa subscription filter, xóa group từ trang chi tiết → về danh sách, group không còn.
  8. `/logs/groups/detail?group=/lc-e2e-missing` → "Log group /lc-e2e-missing not found"; `/logs/groups/stream?group=<group thật>&stream=nope` → "Log stream nope not found"; fixture không có `console.error`.
  9. Form tạo: tên `has space` bị chặn (`aria-invalid`).
- [ ] **Step 2: Chạy:** `docker compose up --build -d console`; `LOCAL_CONSOLE_URL=http://127.0.0.1:3701 npm run test:e2e -w tests -- logs` → PASS; `npm run test:ui -w tests -- -g logs` → PASS.
- [ ] **Step 3: Kiểm giao diện** ở 1440 / 1024 / 390px:
  - Trang: danh sách, chi tiết 3 tab, trang stream, các modal.
  - Tên group / stream và message dài không làm trang cuộn ngang.
  - Lambda › Monitor và ECS › Logs trông như cũ.
- [ ] **Step 4: Cập nhật tài liệu** theo Files; `npx prettier --write` các file docs đã sửa.
- [ ] **Step 5: Hoàn tất:**
  - `/ponytail-review` + `/ponytail-audit`, rồi sửa.
  - Chạy full UT / IT / E2E / UI / UX / mobile trên console Docker (`test:mobile` cần `LOCAL_CONSOLE_URL=http://127.0.0.1:3701`).
  - `node tests/it/leftovers.mjs --delete`.
  - Báo file cho user commit.
