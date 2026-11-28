# Amazon DocumentDB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dev tạo / xóa cluster và instance DocumentDB trên Floci, lấy connection string cho app trong compose / Lambda, và mở cluster bằng GUI (MongoDB Compass) / mongosh trên máy qua lệnh `socat` console in sẵn.

**Architecture:** Service mới `web/src/services/docdb/` theo khuôn ECS / Kinesis (`routes.ts`, `constants.ts`, `schemas.ts`, hàm thuần trong `clusters.ts`, hooks TanStack Query, trang `lazyPage`), một dòng trong `registry.ts`. Gọi Floci bằng `@aws-sdk/client-rds` (đã có, `useRDS`) qua proxy `/aws`. **Không sửa server, không cài package.**

**Tech Stack:** React 19, Cloudscape, react-hook-form + zod (`useZodForm`), TanStack Query v5, `@aws-sdk/client-rds`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-documentdb-design.md` (đã duyệt 2026-11-26). Đọc mục 2, 3, 5, 7 trước khi làm.

## Global Constraints

- **Không cài package, không chạy git ghi** (CLAUDE.md). Bước "Commit" của mỗi task = báo file đã sửa để user tự commit.
- `@aws-sdk/client-rds` không được import ở `shared/`, `registry.ts`, `index.tsx`, `routes.ts`, `constants.ts`, `schemas.ts`, `clusters.ts` (chỉ `import type`) — development.md › Traps: bundle.
- Route: `/docdb/clusters`, `/docdb/clusters/create`, `/docdb/clusters/:cluster?tab=connectivity|instances` (Connectivity mặc định, không ghi lên URL; dùng `withTab` của `@shared/routes.ts`, `useTabParam`). Sidebar: **Clusters**; nhóm `database`; icon Tabler `IconLeaf`.
- Mọi lời gọi lọc `Filters: [{ Name: "engine", Values: ["docdb"] }]`. **Không** gọi `DescribeDBClusters` / `DescribeDBInstances` theo identifier (404 → `console.error`, spec 7 #5): dò trong danh sách.
- `DBClusterMembers` Floci trả rỗng (spec 7 #2): gom instance bằng `DBClusterIdentifier` của `DescribeDBInstances`.
- Luật AWS (Floci nhận cả giá trị sai, form tự chặn):
  - Cluster / instance identifier: `/^[a-z](?!.*--)[a-z0-9-]{0,62}$/` và không kết thúc bằng `-` (dùng lại `IDENTIFIER_PATTERN` / `IDENTIFIER_MAX_LENGTH` của RDS nếu đủ, thêm kiểm `--` và đuôi `-`).
  - Master username: 1–63, `/^[A-Za-z][A-Za-z0-9]*$/`.
  - Master password: 8–100 ký tự ASCII in được trừ `/`, `"`, `@`: `/^[ !#-?A-~]+$/` (khác RDS: DocumentDB cho phép `'` và khoảng trắng).
  - Instance class: `db.t3.medium` (mặc định), `db.r5.large`, `db.r6g.large`; số instance 1–16, mặc định 1.
- Lệnh `socat` (spec 3.3) phải đúng từng ký tự: `127.0.0.1`, `--rm`, image `alpine/socat:1.8.0.3`, network lấy bằng `docker inspect` từ `floci-aws-docdb-<cluster>`, đích `floci-aws-docdb-<cluster>:27017`. Cổng máy là tham số (mặc định 27017).
- Mô tả cố định (tiếng Anh): "Floci doesn't publish this cluster's port. Run this once to forward it to localhost (macOS / Linux shell):" · "Keep 127.0.0.1: it stops other machines on your network from reaching the database. Use another port (27018…) for a second cluster. Stop it with docker stop docdb-forward-<cluster>; run it again after Floci restarts." · "No TLS: remove tls=true from a connection string copied from AWS." · "Floci drops DocumentDB containers when it restarts: delete and recreate the cluster." · "Write the password down: AWS and Floci don't return it."
- Code theo CLAUDE.md: hằng số có tên, comment tiếng Việt ngắn nói lý do, hạn chế type assertion, dùng lại `shared/` (`BulkActionModal`, `StatusBadge`, `useTabParam`, `withTab`, `CodeSnippet`, `ConnectCard`, `copyable`, `ReferenceLink`, `chunks` nếu cần). Sau khi code: `npm run typecheck`, `npm run lint`, `npx prettier --check`, `/ponytail-review`.

## Review Focus

1. **Instance gom đúng cluster**, kể cả khi `DBClusterMembers` rỗng và có instance của cluster khác / instance mồ côi → test `groupClusters` (Task 1).
2. **Lệnh `socat` an toàn và đúng**: luôn `127.0.0.1`, `--rm`, đúng tên cluster ở cả network lẫn đích, đổi cổng máy thì chỉ đổi phần trước `:27017` → test `socatCommand` (Task 1).
3. **Luật tên / password**: `--`, đuôi `-`, chữ hoa, password có `@` / `/` / `"`, password 101 ký tự → bị chặn; password có `'` và khoảng trắng → nhận → test schema (Task 1).
4. **Cluster không có** → "Cluster … not found", không `console.error` (không gọi theo identifier) → E2E (Task 4).
5. **Xóa cluster còn instance** → xóa instance trước rồi cluster, một lần xác nhận; lỗi một phần thì báo từng cluster → IT + E2E (Task 2, 4).

---

## File Structure

```text
web/src/services/docdb/
├── index.tsx                  # ServiceDefinition (Task 2)
├── routes.ts                  # route, tab, crumbs (Task 1)
├── constants.ts               # luật AWS, instance class, cổng, image socat, mô tả cố định (Task 1)
├── schemas.ts                 # createClusterSchema, addInstanceSchema (Task 1)
├── clusters.ts                # groupClusters, appConnectionString, localConnectionString, socatCommand (Task 1)
├── codeSamples.ts             # Connect: Node.js / Python đọc DOCDB_URI (Task 3)
├── hooks/useClusters.ts       # list (gom instance), create (kèm instance), delete (kèm instance) (Task 2)
├── hooks/useInstances.ts      # add, delete (Task 3)
├── pages/ClusterList.tsx, CreateCluster.tsx (Task 2), ClusterDetail.tsx (Task 3)
└── components/                # DeleteClustersModal (Task 2); ConnectivityTab, InstancesTab, AddInstanceModal, DeleteInstancesModal (Task 3)
web/test/services/docdb/docdb.test.ts   # unit (Task 1)
tests/it/docdb.test.ts, tests/e2e/docdb.spec.ts  # (Task 2–4)
```

---

### Task 1: Hàm thuần, hằng số, schema, routes

**Files:**

- Create: `web/src/services/docdb/constants.ts`, `routes.ts`, `schemas.ts`, `clusters.ts`
- Test: `web/test/services/docdb/docdb.test.ts`

**Interfaces:**

- Produces (`constants.ts`): `DOCDB_ENGINE = "docdb"`; `ENGINE_FILTER = [{ Name: "engine", Values: [DOCDB_ENGINE] }]`; `DOCDB_PORT = 27017`; `INSTANCE_CLASSES = ["db.t3.medium", "db.r5.large", "db.r6g.large"] as const`, `DEFAULT_INSTANCE_CLASS`; `INSTANCE_COUNT = { min: 1, max: 16, default: 1 }`; `IDENTIFIER_MAX_LENGTH = 63`, `USERNAME_MAX_LENGTH = 63`, `PASSWORD_LENGTH = { min: 8, max: 100 }` và các pattern ở Global Constraints; `SOCAT_IMAGE = "alpine/socat:1.8.0.3"`; `FLOCI_CONTAINER_PREFIX = "floci-aws-docdb-"`; `CLUSTER_STATUS_STYLES` (`available` success, `creating` / `modifying` in-progress, `deleting` pending); các câu mô tả cố định.
- Produces (`clusters.ts`): `interface ClusterRow { id; arn?; status?; endpoint?; readerEndpoint?; port: number; username?; engineVersion?; instances: DBInstance[] }`; `groupClusters(clusters: DBCluster[], instances: DBInstance[]): ClusterRow[]` (gom theo `DBClusterIdentifier`, bỏ instance không thuộc cluster nào trong danh sách); `appConnectionString(row, user = "<user>")` → `mongodb://<user>:<password>@<endpoint>:27017/?directConnection=true&retryWrites=false`; `localConnectionString(user, localPort = DOCDB_PORT)` → `mongodb://<user>:<password>@localhost:<port>/?directConnection=true`; `socatCommand(cluster: string, localPort = DOCDB_PORT): string` (chuỗi nhiều dòng đúng spec 3.3).
- Produces (`schemas.ts`): `createClusterSchema` → `{ identifier; username; password; confirmPassword; instanceClass; instanceCount: number }` (password khớp confirm); `addInstanceSchema` → `{ identifier; instanceClass }`.
- Produces (`routes.ts`): `DOCDB_SERVICE_ID = "docdb"`; `DOCDB_ROUTE_PATTERNS = { clusters: "clusters", createCluster: "clusters/create", cluster: "clusters/:cluster" }`; `CLUSTER_TABS = { connectivity: "connectivity", instances: "instances" }`; `docdbRoutes = { clusters, createCluster, cluster(id, tab?) }`; `docdbBaseCrumbs`, `clusterCrumbs(id)`.

- [ ] **Step 1: Viết test thất bại** `web/test/services/docdb/docdb.test.ts`:

```ts
const cluster = (id: string) => ({ DBClusterIdentifier: id, Endpoint: "172.28.0.6", Port: 27017 });
const instance = (id: string, clusterId?: string) => ({
  DBInstanceIdentifier: id,
  DBClusterIdentifier: clusterId,
});

it("groups instances by cluster even though DBClusterMembers is empty", () => {
  const rows = groupClusters(
    [cluster("a"), cluster("b")],
    [instance("a-1", "a"), instance("a-2", "a"), instance("x-1", "x"), instance("lone")],
  );
  expect(rows.map((row) => [row.id, row.instances.map((i) => i.DBInstanceIdentifier)])).toEqual([
    ["a", ["a-1", "a-2"]],
    ["b", []],
  ]);
});
it("builds a socat command that stays on 127.0.0.1 and targets the cluster container", () => {
  const command = socatCommand("orders-db");
  expect(command).toContain("docker run --rm -d --name docdb-forward-orders-db");
  expect(command).toContain('floci-aws-docdb-orders-db)"');
  expect(command).toContain("-p 127.0.0.1:27017:27017 alpine/socat:1.8.0.3");
  expect(command).toContain("tcp-connect:floci-aws-docdb-orders-db:27017");
  expect(socatCommand("orders-db", 27018)).toContain("-p 127.0.0.1:27018:27017");
});
it("builds connection strings for apps in compose and for Compass", () => {
  expect(appConnectionString({ endpoint: "172.28.0.6", port: 27017 }, "admin1")).toBe(
    "mongodb://admin1:<password>@172.28.0.6:27017/?directConnection=true&retryWrites=false",
  );
  expect(localConnectionString("admin1")).toBe(
    "mongodb://admin1:<password>@localhost:27017/?directConnection=true",
  );
});
it("checks AWS naming and password rules Floci doesn't", () => {
  const valid = {
    identifier: "orders-db",
    username: "admin1",
    password: "it's a pass",
    confirmPassword: "it's a pass",
    instanceClass: "db.t3.medium",
    instanceCount: "1",
  };
  expect(createClusterSchema.safeParse(valid).success).toBe(true);
  for (const identifier of ["Orders", "1db", "a--b", "db-", "a".repeat(64)])
    expect(createClusterSchema.safeParse({ ...valid, identifier }).success).toBe(false);
  for (const password of ["short", "has@at!!", "has/slash", 'has"quote', "x".repeat(101)])
    expect(
      createClusterSchema.safeParse({ ...valid, password, confirmPassword: password }).success,
    ).toBe(false);
  expect(createClusterSchema.safeParse({ ...valid, confirmPassword: "other pass" }).success).toBe(
    false,
  );
  expect(createClusterSchema.safeParse({ ...valid, instanceCount: "17" }).success).toBe(false);
});
it("keeps the default tab off the URL", () => {
  expect(docdbRoutes.cluster("orders-db")).toBe("/docdb/clusters/orders-db");
  expect(docdbRoutes.cluster("orders-db", CLUSTER_TABS.instances)).toBe(
    "/docdb/clusters/orders-db?tab=instances",
  );
});
```

- [ ] **Step 2: Chạy, thấy fail:** `npm test -w web -- docdb` → FAIL (module không có).
- [ ] **Step 3: Viết 4 file** theo Interfaces.
- [ ] **Step 4: Chạy lại:** `npm test -w web -- docdb` → PASS; `npm run typecheck` → 0 lỗi.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 2: Service, danh sách, tạo, xóa

**Files:**

- Create: `web/src/services/docdb/index.tsx`, `hooks/useClusters.ts`, `pages/ClusterList.tsx`, `pages/CreateCluster.tsx`, `components/DeleteClustersModal.tsx`, `tests/it/docdb.test.ts`
- Modify: `web/src/registry.ts` (sau `rdsService`); `tests/it/leftovers.mjs` (cluster `lc-it-*` / `lc-e2e-*` engine docdb: xóa instance rồi cluster); `tests/ui/responsive.spec.ts` (`/docdb/clusters`, `/docdb/clusters/create`)

**Interfaces:**

- Consumes: Task 1.
- Produces: `DOCDB_QUERY_ROOT = "docdb"`; `useClusters(): UseQueryResult<ClusterRow[]>` (`DescribeDBClusters` + `DescribeDBInstances` với `ENGINE_FILTER`, `groupClusters`); `useCluster(id)` → `{ data: ClusterRow | null }` (lấy từ `useClusters`, `null` khi không có); `useCreateCluster()` (`CreateDBCluster` `Engine: docdb` rồi `CreateDBInstance` × `instanceCount`, identifier instance `<cluster>-<n>`); `useDeleteClusters()` (`runEach`: `DeleteDBInstance` mọi instance của cluster rồi `DeleteDBCluster` `SkipFinalSnapshot: true`), mutation input `readonly ClusterRow[]`.

- [ ] **Step 1: Viết IT** `tests/it/docdb.test.ts` (`new RDSClient(viaConsole(region))`): tạo cluster `lc-it-docdb-…` + 2 instance → `DescribeDBClusters` (filter engine) có cluster, `DBClusterMembers` rỗng, `DescribeDBInstances` (filter engine) có 2 instance mang `DBClusterIdentifier`; `DescribeDBClusters({ DBClusterIdentifier: <lạ> })` reject `DBClusterNotFoundFault` 404; `DeleteDBCluster` còn instance → reject `InvalidDBClusterStateFault`; xóa instance rồi cluster → hết. `afterAll` xóa sạch.
- [ ] **Step 2: Chạy:** `npm run test:it -w tests -- docdb` → PASS (ghi lại hành vi Floci; fail thì dừng và báo — spec cần sửa).
- [ ] **Step 3: Viết code.** `ClusterList` theo `ecs/pages/ClusterList.tsx`: cột Cluster (link), Status (`StatusBadge` + `CLUSTER_STATUS_STYLES`), Instances, Endpoint (`<endpoint>:<port>`); "Find clusters by name"; Delete → `DeleteClustersModal` (`BulkActionModal`, lines = tên cluster, câu: "Instances of these clusters are deleted with them. Data is gone; Floci leaves the MongoDB volume behind."). `CreateCluster` theo `ecs/pages/CreateService.tsx`: các trường spec 3.2, password dạng `type="password"`, mô tả "The first cluster takes about 30 s: Floci downloads MongoDB." và câu nhắc ghi password; tạo xong `navigate(docdbRoutes.cluster(id))`.
- [ ] **Step 4: Kiểm:** `npm run typecheck`; `npm run test:ui -w tests -- -g docdb` → PASS.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 3: Chi tiết — Connectivity, Instances, Connect

**Files:**

- Create: `web/src/services/docdb/pages/ClusterDetail.tsx`, `components/ConnectivityTab.tsx`, `components/InstancesTab.tsx`, `components/AddInstanceModal.tsx`, `components/DeleteInstancesModal.tsx`, `hooks/useInstances.ts`, `codeSamples.ts`
- Modify: `index.tsx` (route); `tests/it/docdb.test.ts`

**Interfaces:**

- Consumes: Task 1–2.
- Produces: `useAddInstance(cluster)` (`CreateDBInstance` `Engine: docdb`, `DBClusterIdentifier`); `useDeleteInstances()` (`runEach` `DeleteDBInstance`); `clusterSample(row: ClusterRow): CodeSample` (Node.js `MongoClient(process.env.DOCDB_URI)` liệt kê database; Python `pymongo.MongoClient(os.environ["DOCDB_URI"])`).

- [ ] **Step 1: Test thất bại** (thêm vào `web/test/services/docdb/docdb.test.ts`): `clusterSample(row).node` chứa `process.env.DOCDB_URI` và `listDatabases`; `.python` chứa `os.environ["DOCDB_URI"]` → FAIL.
- [ ] **Step 2: IT** (thêm vào `tests/it/docdb.test.ts`): thêm instance vào cluster có sẵn → `DescribeDBInstances` filter engine có instance mới với đúng `DBClusterIdentifier`; xóa nó → hết.
- [ ] **Step 3: Viết code.** `ClusterDetail`: `useCluster(id)`, `null` → `NotFound` "Cluster {id} not found"; header: `StatusBadge`, số instance, "Engine {engineVersion} (Floci runs MongoDB 7.0)"; nút Delete (`DeleteClustersModal`, xong về danh sách), Add instance; tab (`useTabParam`) Connectivity / Instances. `ConnectivityTab`: `KeyValuePairs` endpoint (`copyable`), reader endpoint, port, master username; khối "From apps in Docker Compose or Lambda" (`CodeSnippet` `appConnectionString`, câu No TLS); khối "From a GUI on your machine (MongoDB Compass, mongosh)" (câu dẫn, `CodeSnippet` `socatCommand(id)`, `CodeSnippet` `localConnectionString(username)`, câu Keep 127.0.0.1); `Alert` info câu "Floci drops DocumentDB containers…"; `ConnectCard` `clusterSample`. `InstancesTab`: bảng identifier, class, status, endpoint; Add instance (`AddInstanceModal`), Delete (`DeleteInstancesModal` = `BulkActionModal`).
- [ ] **Step 4: Kiểm:** `npm test -w web -- docdb`; `npm run test:it -w tests -- docdb` → PASS; `npm run typecheck`; tay: chạy lệnh `socat` copy từ trang, `docker run --rm mongo:7.0 mongosh "mongodb://<user>:<password>@host.docker.internal:27017/?directConnection=true" --eval 'db.adminCommand({ping:1})'` → `ok: 1`; mở bằng MongoDB Compass nếu có.
- [ ] **Step 5: Báo file cho user commit.**

---

### Task 4: E2E, kiểm giao diện, tài liệu

**Files:**

- Create: `tests/e2e/docdb.spec.ts`
- Modify: `docs/development.md` (Traps: mục DocumentDB — không kết nối từ máy dev / lệnh `socat`, mất dữ liệu khi Floci restart, volume MongoDB bị bỏ lại, `DBClusterMembers` rỗng, password không đổi được, 404 khi gọi theo identifier); `docs/superpowers/specs/2026-11-26-documentdb-design.md` (Trạng thái: đã làm, Kết quả thử); `docs/superpowers/roadmap.md` (DocumentDB: đã làm); `README.md` (dòng DocumentDB, nhóm Database)

- [ ] **Step 1: Viết E2E** (`lc-e2e-*`): Create cluster (2 instance) → chi tiết: Connectivity có connection string chứa endpoint và lệnh `socat` chứa `floci-aws-docdb-<cluster>` + `127.0.0.1` → tab Instances có 2 dòng → Add instance → 3 dòng → Delete 1 instance → 2 → Delete cluster từ trang chi tiết → về danh sách, cluster không còn. Thêm: mở `/docdb/clusters/lc-e2e-missing` → "Cluster lc-e2e-missing not found", không `console.error`. Form tạo: identifier `bad--name` bị chặn.
- [ ] **Step 2: Chạy:** `docker compose up --build -d console`; `LOCAL_CONSOLE_URL=http://127.0.0.1:3701 npm run test:e2e -w tests -- docdb` → PASS; `npm run test:ui -w tests -- -g docdb` → PASS.
- [ ] **Step 3: Kiểm giao diện** 1440 / 1024 / 390px: danh sách, tạo, chi tiết 2 tab, modal; lệnh `socat` dài không làm trang cuộn ngang (`CodeSnippet` cuộn trong khung).
- [ ] **Step 4: Cập nhật tài liệu** theo Files. `npx prettier --write` các file docs đã sửa.
- [ ] **Step 5: `/ponytail-review` + `/ponytail-audit`, sửa; chạy full UT / IT / E2E / UI / UX / mobile trên console Docker; báo file cho user commit.**
