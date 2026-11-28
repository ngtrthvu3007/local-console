# Tách core — Thiết kế

> Ngày: 2026-11-27 · Trạng thái: **chờ duyệt** · Plan: [2026-11-27-core](../plans/2026-11-27-core.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · Thứ tự (user chốt 2026-11-27): **tách core** → test lại toàn bộ → test kỹ API Gateway → [MCP server](2026-11-27-mcp-server-design.md) → [bảo mật](2026-11-27-security-design.md)

## 1. Mục tiêu

Tách phần logic không dính giao diện của web ra một workspace mới `core/` (`@localconsole/core`), để **web và MCP server dùng chung đúng một đoạn code** cho mỗi thao tác:

- Cùng kiểm input (zod schema của form).
- Cùng chuỗi lệnh gọi SDK, kể cả bước nối service khác và chỗ né bug của Floci.
- Cùng dạng dữ liệu trả về (mapper như `toQueue`).

Đây là điều kiện để MCP "native với UI" ([spec MCP](2026-11-27-mcp-server-design.md)): agent gọi tool nào thì kết quả giống hệt user bấm nút tương ứng. Lợi ích phụ: mọi lệnh gọi endpoint riêng của Floci nằm một chỗ, sau này thêm adapter cho emulator khác chỉ sửa ở đó.

**Không đổi hành vi của UI.** Sau khi tách, mọi màn hình, thông báo, cache và test phải như cũ.

---

## 2. Hiện trạng (đo ngày 2026-11-27, sau khi merge API Gateway)

| Hạng mục                                            | Số liệu                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service                                             | 25 (cả `apigateway`) + `integrations`                                                                                                                                                                                                                                                                             |
| Hook (`services/*/hooks`)                           | 9.251 dòng, 148 `queryFn`, 163 `mutationFn`                                                                                                                                                                                                                                                                       |
| File thuần đã có dạng operation                     | `apigateway/apis.ts`, `cloudformation/stacks.ts`, `eventbridge/{buses,rules,schedules}.ts`, `integrations/{scans,senders}.ts`, `s3/operations.ts`, `stepfunctions/stateMachines.ts`                                                                                                                               |
| File thuần còn dính UI                              | ~20 file, đa số `import type`: `StatusIndicatorProps` trong `constants.ts` của 9 service; type khai báo trong hook (`IndexKeys` của dynamodb, `RevisionRow` của ecs); `runEach` / `notifyError` của `useNotify` (`s3/operations.ts`, `s3/presign.ts`, hook SES…); `mq/credentials.ts`, `shared/aws.ts` dùng React |
| Hook gọi hook service khác                          | 11 file (cognito, docdb, eventbridge, kinesis, lambda, s3, sqs)                                                                                                                                                                                                                                                   |
| Component / page gọi SDK hoặc `fetchJson` trực tiếp | 2 file: `lambda/components/BrokenTriggersAlert.tsx`, `shared/logs/useLogEvents.ts` (grep `.send(`, `paginate*`, `fetchJson(`)                                                                                                                                                                                     |
| Test                                                | 58 file unit ở `web/test`, 55 spec IT / E2E ở `tests/`                                                                                                                                                                                                                                                            |

Hook lớn nhất: s3 (990 dòng), lambda (961), cognito (873), ecs (546), appsync (505), eventbridge (507), dynamodb (492). Nhỏ nhất: ssm (121), rds (129), ec2 (147), docdb (153).

---

## 3. Phạm vi

### Làm

- Workspace `core/` và cấu hình (package, tsconfig, vitest, Dockerfile).
- Chuyển sang `core/` cho **cả 25 service**: operation (lệnh gọi SDK / endpoint Floci), facade `service.ts` của mỗi service (mục 4.1), zod schema, mapper, constants không dính UI, đường dẫn trang.
- Phần dùng chung: lỗi AWS (`isNotFoundError`, `existsUnlessMissing`), `runEach`, `errorMessage`, format, encoding (`fromBase64`), endpoint riêng của Floci.
- Hook của web chỉ còn bọc react-query (query key, invalidate, refetch, notify) quanh facade của core.
- Component đang gọi SDK trực tiếp: chuyển lệnh gọi vào operation của core.
- Chuyển unit test của file đã dời sang `core/test`.
- Test lại toàn bộ, rồi test kỹ API Gateway (mục 7).

### Không làm

| Việc                                                                 | Lý do                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Đổi hành vi, giao diện, câu chữ                                      | Chỉ dời code; đổi gì thì làm việc riêng                       |
| Adapter cho emulator khác                                            | Chưa có emulator thứ hai; chỉ gom endpoint Floci vào một file |
| Viết lại react-query thành thứ khác                                  | Ngoài mục tiêu                                                |
| Dời component, page, hook UI thuần (`useTabParam`, `useSplitPanel`…) | Thuộc web                                                     |

---

## 4. Cấu trúc

```text
core/
  package.json      @localconsole/core, "sideEffects": false, exports "./shared" + "./*" (barrel, mục 4.2 luật 7)
  tsconfig.json     lib es2024, types node (fetch, URL), erasableSyntaxOnly
  .oxlintrc.json    chặn React / Cloudscape / react-query / DOM global (mục 4.2 luật 1)
  src/
    shared/
      constants.ts    hằng dùng chung
      index.ts        barrel: @localconsole/core/shared
      aws/            client.ts (awsClient) · errors.ts (isNotFoundError, existsUnlessMissing…) · pagination.ts
      floci/          endpoints.ts (FLOCI_ENDPOINTS, flociUrl) · service.ts (facade Floci)
      http/           fetchJson.ts
      types/          keyValue.ts
      utils/          arn · bulk (runEach) · encoding · errorMessage · format · json · paths (fillPath…)
      validation/     schemas.ts (helper zod cho form)
    services/<service>/
      operations/   hàm thuần (client, input) → kết quả; một file cho mỗi hook cũ (useQueues → queues.ts)
      service.ts    facade: create<Service>Service(client, deps) gom mọi operation (mục 4.1)
      schemas.ts    zod, câu báo lỗi giữ nguyên
      <mapper>.ts   toQueue … (dời nguyên file hiện có, giữ tên)
      constants.ts  phần không dính UI
      paths.ts      đường dẫn trang console, web và MCP cùng dùng
      index.ts      barrel: @localconsole/core/<service>
  test/             unit test của các file trên
```

### 4.1 Pattern: Service Facade + DI qua factory function (user chốt 2026-11-27)

Một design pattern đơn giản, không áp kiến trúc lớn (Clean / Hexagonal):

- **Service Facade:** mỗi service có một "cửa vào" `service.ts`, gom mọi thao tác của service đó thành một object. Web và MCP chỉ dùng facade, không gọi lẻ operation.
- **DI qua tham số của factory:** facade nhận client và service khác nó cần qua tham số (`deps`), không tự tạo, không import service khác để gọi.
- **Function, không class:**
  - codebase hiện chỉ có một class (`HttpError` kế thừa `Error`);
  - hook truyền thẳng method làm callback (`queryFn: sqs.listQueues`): method của class mất `this` khi bị tách ra, closure của factory thì không;
  - `erasableSyntaxOnly` cấm parameter property nên class dài hơn;
  - type lấy bằng `ReturnType`, facade giả cho test là object literal.
    Lỗi riêng (nếu cần) vẫn là class kế thừa `Error`.
- **Không Singleton trong core:** web (proxy `/aws`, region đọc từ `/api/config` sau khi trang tải) và server (`AWS_ENDPOINT_URL`) cần client khác nhau; singleton trong core phải có `init()` và state toàn cục. Thay vào đó mỗi app tạo instance **một lần** ở composition root của nó (mục 4.3).

```ts
// core/src/services/sqs/service.ts
export function createSqsService(
  sqs: SQSClient,
  deps: { lambda: LambdaService; flociUrl: string },
) {
  return {
    listQueues: () => listQueues(sqs),
    createQueue: (input: CreateQueueInput) => createQueue(sqs, input),
    peekMessages: (queueUrl: string) => peekMessages(deps.flociUrl, queueUrl),
    addTrigger: (queue: Queue, input: AddQueueTriggerInput) =>
      deps.lambda.createQueueTrigger({ ...input, queueArn: queue.arn }),
    // … mọi operation của SQS
  };
}
export type SqsService = ReturnType<typeof createSqsService>;
```

### 4.2 Luật của `core/`

1. Không import `react`, `react-*`, `@cloudscape-design/*`, `@tanstack/*`, `@hookform/*`, kể cả `import type`; không dùng `window`, `document`, `sessionStorage`, `localStorage`, `Buffer`, `process`. **oxlint** chặn (`no-restricted-imports`, `no-restricted-globals`; đã thử 2026-11-27 với oxlint 1.93). `tsconfig` không chặn được vì types React có sẵn trong `node_modules`.
2. Import có đuôi `.ts`. Cùng thư mục: `./`. Đi lên thư mục cha: alias của `core/package.json` `"imports"` — `#shared/*` → `./src/shared/*`, `#services/*` → `./src/services/*` (vd `#shared/utils/bulk.ts`, `#services/logs/service.ts`); không dùng `../`. Node, TypeScript (nodenext / bundler), Vite, Vitest đều đọc trường này, không cần cấu hình thêm (user chốt 2026-11-27).
3. Chỉ cú pháp TS xóa được (`erasableSyntaxOnly`, như `server/`): không `enum`, `namespace`, parameter property.
4. Operation nhận client và input, trả dữ liệu; không báo lỗi ra UI (`notify…`), không đọc config của trang.
5. Operation không import operation / facade của service khác để **gọi**; thao tác nối service đi qua `deps` của facade. Import schema / constants / type của service khác thì được (vd: schema SQS dùng schema Lambda).
6. Không vòng import giữa các service. Facade bảo đảm cho phần gọi (muốn truyền Lambda vào SQS thì Lambda phải tạo trước); phần schema / constants kiểm bằng review.
7. Barrel chỉ ở 2 chỗ (user chốt 2026-11-27, để import ngắn còn 2–3 cấp): `core/src/shared/index.ts` → `@localconsole/core/shared`, và `core/src/services/<s>/index.ts` → `@localconsole/core/<s>` (facade, schema, constants, paths, mapper, type input; **không** export operation lẻ, bên ngoài phải đi qua facade). Trong core import thẳng từng file, không qua barrel (tránh vòng import). `core/package.json` có `"sideEffects": false` để Rollup bỏ module không dùng trong barrel; bundle kiểm bằng `npm run bundle -w tests`.

### 4.3 Composition root: mỗi app nối dây kiểu riêng

| App          | Nối dây ở đâu                                                                                                                                                                                 | Vì sao                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web          | **Theo từng service**, hook `web/src/services/<s>/hooks/use<S>Service.ts`: `useMemo(() => create<S>Service(client, deps), [client, …])`; deps lấy từ hook service khác (`useLambdaService()`) | Facade chỉ bị import trong chunk lazy của trang service đó; SDK vẫn tải cùng trang như hiện nay. **Không có root gom 25 service ở web** (đo: lần tải đầu tăng 73%, mục 8 #5) |
| Server (MCP) | Một hàm `createServices(config)` ở `server/src/mcp/services.ts`, gọi một lần khi khởi động                                                                                                    | Node không bundle. Đặt ở server, không đặt trong core, để web không import nhầm                                                                                              |
| Test         | Truyền facade giả (object literal) vào `deps`                                                                                                                                                 | —                                                                                                                                                                            |

**Web sau khi tách:**

- `web/package.json` thêm dependency `@localconsole/core` (workspace). Import qua barrel: `@localconsole/core/sqs`, `@localconsole/core/shared`.
- Hook: `const sqs = useSqsService(); useQuery({ queryKey, queryFn: sqs.listQueues })`. Client vẫn tạo qua `useAwsClient` (proxy `/aws`). Query key, invalidate, notify giữ ở hook.
- Phần dính UI ở lại web: map trạng thái sang `StatusIndicatorProps`, `routes.ts` (crumbs, `lazyPage`), notify, component.
- `routes.ts` của web dùng `paths.ts` của core để dựng link, nên link trên UI và `consoleUrl` của MCP không lệch nhau.

**Dependency:** AWS SDK client chuyển sang `core/package.json` theo service đã tách; web giữ package nào nó còn import trực tiếp. Mọi thay đổi package do user tự chạy lệnh cài (plan ghi sẵn lệnh, có `--min-release-age=7` khi thêm bản mới).

---

## 5. Docker và chạy server

- Node chạy thẳng `.ts` qua symlink workspace (`node_modules/@localconsole/core → ../core`), nhưng **từ chối** file `.ts` nằm thật trong `node_modules` (thử 2026-11-27, mục 8 #1). Image phải giữ symlink.
- `Dockerfile` đợt này: stage `build` và `deps` thêm `COPY core/package.json core/` trước `npm ci` (npm cần đủ `package.json` của mọi workspace để `npm ci` khớp lockfile; web build cần source của core, đã có nhờ `COPY . .`).
- Server **chưa** import core trong đợt này. Stage chạy (`COPY core/package.json core/`, `COPY core/src core/src`, giữ symlink trong `node_modules`) làm ở [plan MCP](../plans/2026-11-27-mcp-server.md), khi server thêm dependency `@localconsole/core`.

---

## 6. Thứ tự tách

Theo phụ thuộc, service bị nhiều nơi dùng tách trước. Mỗi bước: tách → typecheck → unit test → test E2E của service đó.

| Bước | Nội dung                                                                                                    | Công     |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------- |
| 0    | Dựng `core/` (package, tsconfig, oxlint, vitest, Dockerfile, script ở root chạy cả core); đo bundle làm mốc | 0,5 ngày |
| 1    | `shared`: aws, bulk, encoding, floci, format, schemas, constants, logs (phần thuần của `shared/logs`)       | 1 ngày   |
| 2    | Service nền: kms, logs, ssm, secretsmanager                                                                 | 1,5 ngày |
| 3    | lambda (nhiều service trỏ tới), integrations                                                                | 1,5 ngày |
| 4    | Nhóm vừa: sqs, sns, ses, kinesis, mq, elasticache, cloudfront, dynamodb                                     | 4 ngày   |
| 5    | Nhóm lớn và nối nhiều: s3, eventbridge, cognito, appsync, ecs, apigateway, stepfunctions                    | 5 ngày   |
| 6    | Còn lại: rds, docdb, ec2, cloudformation (link mọi service nên làm cuối)                                    | 1 ngày   |
| 7    | Test lại toàn bộ + test kỹ API Gateway (mục 7)                                                              | 1,5 ngày |

Tổng ước lượng **~16 ngày**, sai số ±30%. Facade thêm khoảng 1 file nhỏ mỗi service (gói lại operation đã dời), không đổi đáng kể tổng công.

---

## 7. Kiểm thử

### 7.1 Sau mỗi service

- `npm run typecheck`, `npm test` (web + core).
- E2E của service vừa tách: `npx playwright test tests/e2e/<service>.spec.ts`.

### 7.2 Sau khi tách xong: test lại toàn bộ

Theo quy trình hiện có ([tests/README.md](../../../tests/README.md)), console chạy bằng `docker compose up --build -d`:

- Unit (web, core, server), IT, E2E, UI, UX, mobile.
- Kiểm image: server khởi động được, `core` resolve được qua symlink.
- **Bundle** so với mốc đo ở bước 0 (script `tests/bundle/measure.mjs`, đo cả lần tải đầu lẫn từng trang): chunk `index` và lần tải đầu không tăng quá 5%; không chunk nào trong lần tải đầu chứa SDK client (`AmazonSQS`, `DynamoDB_20120810`, `2015-03-31/functions`…); dung lượng mở trang `QueueList`, `QueueDetail`, `FunctionList` không tăng quá 5%.
- Ghi kết quả vào `tests/REPORT.md`.

### 7.3 Test kỹ API Gateway

API Gateway do người khác làm và vừa merge (`feat: API gateways`), nên sau khi tách core test sâu hơn các service khác:

- Đối chiếu từng tính năng trong [apigateway-design](2026-11-19-apigateway-design.md) với UI thật: REST, HTTP, WebSocket; route → Lambda; invoke URL; gọi thử.
- IT và E2E đang có của API Gateway: chạy, rồi bổ sung chỗ spec có mà test chưa phủ.
- Đường lỗi: Lambda không tồn tại, thiếu quyền invoke (`lambdaPermissions.ts`), authorizer, API bị xóa giữa chừng.
- Mobile / responsive cho các trang API Gateway.
- Lỗi tìm được: ghi danh sách, báo user trước khi sửa (có thể không thuộc phần tách core).

---

## 8. Rủi ro đã kiểm tra

| #   | Kiểm                                                                                                                               | Kết quả                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Node chạy `.ts` của workspace khác qua symlink trong `node_modules` (Node 26.13 trên máy; image dùng Node 24, kiểm lại trong plan) | Symlink: chạy được. File copy thật vào `node_modules`: lỗi (Node không bỏ type cho file trong `node_modules`)                 |
| 2   | Vite đọc package workspace dạng `.ts`                                                                                              | Đang dùng cách tương tự cho `@server/*` (alias trong `web/tsconfig.json`); kiểm lại với package `@localconsole/core` ở bước 0 |
| 3   | `runEach`, `errorMessage`                                                                                                          | Hàm thuần nằm trong `useNotify.ts`, dời được; phần notify ở lại web                                                           |
| 4   | Test mock hook                                                                                                                     | Không có `vi.mock` nào trỏ vào `hooks/` (grep 2026-11-27); test chỉ đổi đường import                                          |

| 5 | Bundle với pattern Facade + DI (2026-11-27, thử thật cho SQS + Lambda trên bản copy của repo, `vite build`) | Xem bảng dưới: nối dây theo từng service **không đổi** byte nào; root gom 25 service ở web làm lần tải đầu tăng 73% |
| 6 | `oxlint` chặn import / global của UI trong core | `no-restricted-imports` bắt cả `import type` từ `react`; `no-restricted-globals` bắt `window.location` (oxlint 1.93) |

**Đo bundle (2026-11-27, `web` sau khi merge API Gateway):**

|                        | Mốc                 | Facade + DI, nối dây theo service | Root gom 25 service ở web |
| ---------------------- | ------------------- | --------------------------------- | ------------------------- |
| Chunk `index`          | 766 KB (gzip 214)   | 766 KB (gzip 214)                 | 1.610 KB (gzip 381)       |
| Tải khi mở app         | 1.223 KB (gzip 350) | 1.223 KB (gzip 350)               | 2.326 KB (gzip 606)       |
| Mở danh sách queue SQS | 2.069 KB (gzip 621) | 2.069 KB (gzip 621)               | 2.675 KB (gzip 725)       |
| Mở chi tiết queue SQS  | 2.314 KB (gzip 707) | 2.314 KB (gzip 706)               | 2.868 KB (gzip 798)       |
| Mở danh sách Lambda    | 1.995 KB (gzip 598) | 1.995 KB (gzip 598)               | 2.656 KB (gzip 717)       |

"Mở trang" = chunk của trang + mọi import tĩnh. Cột cuối chỉ tạo client, chưa có code operation, nên làm thật còn lớn hơn. SDK của mỗi service hiện nằm trong chunk riêng (vd `AmazonSQS` chỉ trong chunk `useQueues`), đúng chủ đích ghi ở `web/src/shared/aws.ts`.

**Rủi ro còn lại:** hồi quy ở chỗ né bug của Floci đang nằm trong hook (retry, chờ trạng thái). Plan phải dời nguyên văn và giữ comment lý do; test E2E sau mỗi service để bắt.

---

## 9. Cách đã cân nhắc

| Cách                                                           | Vì sao không chọn                                                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tự gọi SDK, không tách                                     | ~300 thao tác viết hai lần, lệch UI dần; đi ngược yêu cầu "native"                                                                                                                                        |
| Server import thẳng `web/src` + bundle bằng Vite               | Không đổi cấu trúc, nhưng ranh giới UI / không UI chỉ là quy ước, dễ vỡ; vẫn phải kéo logic ra khỏi hook như cách này                                                                                     |
| Tách dần theo service khi MCP cần                              | User chốt tách hết một lần để test lại toàn bộ một lượt (2026-11-27)                                                                                                                                      |
| Clean / Hexagonal (port, repository interface, use case class) | Mỗi port chỉ có một bản cài (AWS SDK); ~300 thao tác thêm interface + class + đăng ký DI, gấp 3–4 lần code mà hành vi không đổi. Chỗ cần thay được duy nhất (endpoint của emulator) đã có DI + `floci.ts` |
| Repository (`queueRepository.list/get/save`)                   | Nhiều thao tác không phải CRUD (purge, redrive, poll), ép vào gượng                                                                                                                                       |
| Command (mỗi thao tác là object `{ schema, run }`)             | Khớp tool MCP nhưng UI không cần; thêm một lớp chỉ một nơi dùng                                                                                                                                           |
| Class cho facade                                               | Mất `this` khi truyền method làm callback; codebase không dùng class; dài hơn vì `erasableSyntaxOnly`                                                                                                     |
| Singleton trong core                                           | Web và server cần client khác nhau; phải có `init()` + state toàn cục, khó test, web đổi region thì giữ client cũ                                                                                         |
| Root gom 25 service ở web                                      | Đo: lần tải đầu tăng 73% (mục 8)                                                                                                                                                                          |
| Operation thuần, không facade (plan bản đầu)                   | Mỗi nơi gọi tự truyền client; phụ thuộc giữa service không khai báo ở đâu                                                                                                                                 |

---

## 10. Quyết định

| Ngày       | Quyết định                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-27 | Tạo workspace `core/`, không React, web và MCP dùng chung                                                                                                   |
| 2026-11-27 | Tách cả 25 service (kể cả API Gateway vừa merge) trước khi làm MCP; sau đó test lại toàn bộ và test kỹ API Gateway                                          |
| 2026-11-27 | Endpoint riêng của Floci gom vào `core/src/shared/floci.ts`; chưa làm adapter                                                                               |
| 2026-11-27 | Pattern: Service Facade + DI qua factory function; viết bằng function, không class; không Singleton trong core                                              |
| 2026-11-27 | Composition root: web nối dây theo từng service (giữ lazy load SDK), server có một `createServices` ở `server/src/mcp/services.ts`                          |
| 2026-11-27 | Barrel ở 2 chỗ (`@localconsole/core/shared`, `@localconsole/core/<service>`) để import ngắn; `sideEffects: false`; service barrel không export operation lẻ |
| 2026-11-27 | `core/src/shared` chia thư mục theo vai trò (aws, floci, http, types, utils, validation) thay vì để phẳng                                                   |
| 2026-11-27 | Alias trong core: `#shared/*`, `#services/*` (subpath imports của package.json), bỏ `../`                                                                   |
| 2026-11-27 | Kiểm bundle trước / sau (mốc ở bước 0, so ở bước 7), ngưỡng 5%                                                                                              |
