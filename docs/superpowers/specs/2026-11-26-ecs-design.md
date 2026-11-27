# Amazon ECS — Thiết kế

> Ngày: 2026-11-26 · Trạng thái: **đã làm** (2026-11-26) · Plan: [2026-11-26-ecs](../plans/2026-11-26-ecs.md) · Thuộc: [Local Console](2026-11-09-localconsole-design.md) · [Roadmap](../roadmap.md): đợt 4 · Khảo sát: [ecs-athena](../researchs/2026-11-19-floci-survey/ecs-athena.md) (phần A)

## 1. Mục tiêu

Màn hình ECS cho cluster, task definition, service và task mà app hoặc CDK tạo trên Floci. Floci chạy mỗi task là **container Docker thật**, nên dev local dùng để:

- Chạy job một lần (migration, batch, worker) với command / env ghi đè, xem exit code, lý do dừng và log.
- Xem service mà CDK deploy đang chạy bao nhiêu task, tắt / bật, đổi revision.
- Sửa task definition (image, env, secret) rồi chạy lại để test.
- Nối ECS với service khác: secret / parameter (Secrets Manager, SSM), log (CloudWatch Logs), rule / schedule (EventBridge, Scheduler), state machine (Step Functions), stack (CloudFormation).

Mọi thao tác gọi thẳng Floci bằng AWS SDK qua proxy `/aws`. **Server không phải sửa gì.** Đã chạy thử trên Floci 2.4.0 (mục 7).

---

## 2. Phạm vi

**Nguyên tắc chọn** (user chốt 2026-11-17, bổ sung 2026-11-19, 2026-11-26): tính năng thỏa (1) dev thường dùng khi code, chạy local, test, **hoặc** (2) cần để nối với service khác, **và** (3) Floci hỗ trợ toàn phần hoặc một phần. CRUD tài nguyên chính luôn làm khi Floci hỗ trợ. Chỉ tính năng hay dùng, làm đơn giản, dùng thẳng dữ liệu Floci trả, giống AWS Console.

### Làm trong đợt này

| Nhóm                  | Tính năng                                                                                                        | Tiêu chí         | Floci 2.4.0                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| Cluster               | Danh sách (số service, task đang chạy), tạo, xóa; chi tiết: tab Services, Tasks                                  | CRUD             | Toàn phần                                         |
| Task definition       | Danh sách family, danh sách revision, chi tiết (container, JSON), tạo / tạo revision mới (JSON), deregister, xóa | CRUD             | Toàn phần; xóa đứng ở `DELETE_IN_PROGRESS` (7 #9) |
| Service               | Tạo, chi tiết (desired / running, tasks, events, cấu hình), sửa (desired count, revision), xóa                   | CRUD, (1)        | Toàn phần; rolling update khác AWS (7 #10)        |
| Task                  | Run task (Fargate, ghi đè command / env), danh sách Running / Stopped, chi tiết, stop                            | CRUD, (1)        | Toàn phần; mất sau khi Floci restart (7 #12)      |
| Task › Logs           | Log của từng container (`awslogs`), tự làm mới                                                                   | (1), (2)         | Toàn phần (7 #3)                                  |
| Secrets Manager / SSM | Container definition: `secrets.valueFrom` link sang trang secret / parameter                                     | (2)              | Toàn phần (7 #2)                                  |
| EventBridge           | Thêm target ECS trong rule và schedule; target ECS hiện link cluster, task definition                            | (2)              | Toàn phần (7 #5, #6)                              |
| Step Functions        | Bước `ecs:runTask` / `ecs:runTask.sync` link sang cluster                                                        | (2)              | Toàn phần (7 #7)                                  |
| CloudFormation        | `StackLink` trên cluster, service, task definition; tab Resources link sang ECS                                  | (2)              | Toàn phần (khảo sát A2)                           |
| Connect               | Thẻ Connect trên trang cluster: Node.js / Python chạy task rồi đọc trạng thái                                    | Như service khác | Toàn phần                                         |

### Để sau

| Tính năng                                 | Ghi chú                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Run task / service với launch type EC2    | Đoán Fargate phổ biến hơn. EC2 + `hostPort` cố định thì port ra máy dev (khảo sát A1) |
| `ExecuteCommand` (mở shell vào container) | Floci trả `streamUrl`, phần websocket chưa kiểm                                       |
| Tag                                       | Đoán ít dùng                                                                          |

### Không làm

| Tính năng                                               | Lý do                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ECR, ELB (load balancer của service)                    | Roadmap mục 5: user chốt 2026-11-17 không cần                                          |
| Container instance, capacity provider, account settings | Dev không dùng khi chạy local                                                          |
| Địa chỉ gọi vào port của task                           | Floci trả `networkBindings` / IP sai (khảo sát A1); console phải tự đoán tên container |
| Health check container                                  | Floci bỏ qua, `healthStatus` luôn `UNKNOWN` (khảo sát A1)                              |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm. Sidebar: nhóm **Compute** (cạnh Lambda, EC2), mục **Clusters**, **Task definitions**. Launch type luôn `FARGATE`, subnet mặc định là subnet `defaultForAz` đầu tiên của `DescribeSubnets` (Floci có sẵn `subnet-default-<region>-a/b/c`).

### 3.1 Clusters — `/ecs/clusters`

```text
Clusters (2)                                         [↻] [Delete] [Create cluster]
[🔍 Find clusters by name   ]
 ◯ Cluster ▲       Services    Running tasks    Pending tasks
 ◯ app-cluster            2                3                0
 ◯ default                0                0                0
```

- `ListClusters` + `DescribeClusters` (tối đa 100 / lần).
- **Create cluster:** modal một ô tên (1–255 ký tự: chữ, số, `-`, `_`) → `CreateCluster`. Tạo xong mở chi tiết.
- **Delete:** `ConfirmModal` gõ `delete` → `DeleteCluster`. Còn service / task đang chạy thì hiện lỗi gốc (`ClusterContainsServicesException`, `ClusterContainsTasksException`).

### 3.2 Chi tiết cluster — `/ecs/clusters/:cluster`

```text
app-cluster                                          [Delete] [Run task]
Active · 2 services · 3 running tasks                 Stack: AppStack ↗
[Services] [Tasks]
(Connect)
```

- Gọi `DescribeClusters` trước: cluster không có → "Cluster … not found" kèm link về danh sách. `ListTasks` / `ListServices` với cluster không có trả 400 (`console.error`), và với tên `default` thì Floci **tự tạo** cluster (7 #13).
- `StackLink` type `AWS::ECS::Cluster`, physical ID = tên cluster. Tab lưu trên URL (`?tab=`), mặc định Services.

**Tab Services:**

```text
Services (2)                                     [↻] [Delete] [Update] [Create]
 ◯ Service ▲      Status     Desired   Running   Task definition
 ◯ api            ● Active         1         1   api:3 ↗
 ◯ worker         ● Active         0         0   worker:1 ↗
```

`ListServices` + `DescribeServices` (tối đa 10 / lần). Update và Delete như 3.5.

**Tab Tasks:**

```text
Tasks (3)                [Running ▾]                         [↻] [Stop] [Run task]
 ◯ Task           Last status   Task definition   Started by          Started at
 ◯ 9f1c…          ● Running     api:3 ↗           ecs-svc/…           10:20:01
 ◯ 3b7a…          ○ Stopped     migrate:2 ↗       scheduler           10:15:00   Exit 3
```

- Lọc Running / Stopped = `ListTasks` (`desiredStatus`) + `DescribeTasks` (tối đa 100 / lần). Task ID rút gọn, bấm mở chi tiết.
- Dòng Stopped có exit code của container essential.
- Mô tả bảng: "Floci doesn't keep tasks across restarts." (7 #12).

### 3.3 Run task — `/ecs/run-task?cluster=…&taskDefinition=…`

Một trang chung, mở từ cluster (điền sẵn cluster) hoặc từ revision task definition (điền sẵn `family:revision`).

| Trường              | Ghi chú                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Cluster             | `Select` từ `ListClusters`                                                                             |
| Task definition     | Family (`Select` từ `ListTaskDefinitionFamilies`) + revision (mặc định mới nhất ACTIVE)                |
| Number of tasks     | 1–10, mặc định 1 (luật AWS)                                                                            |
| Subnets             | `Multiselect` từ `DescribeSubnets`, mặc định subnet `defaultForAz` đầu tiên; bắt buộc (7 #11)          |
| Security groups     | `Multiselect` từ `DescribeSecurityGroups`, mặc định `default`                                          |
| Container overrides | Mỗi container: **Command** (mảng JSON, vd `["sh","-c","echo hi"]`), **Environment** (`KeyValueEditor`) |

`RunTask` (`launchType: FARGATE`, `networkConfiguration.awsvpcConfiguration`, `overrides.containerOverrides`). Response có `failures` thì hiện lỗi. Xong mở chi tiết task (1 task) hoặc tab Tasks của cluster (nhiều task).

### 3.4 Chi tiết task — `/ecs/clusters/:cluster/tasks/:taskId`

```text
Task 9f1c2a…                                                   [↻] [Stop]
Last status ● Stopped   Desired STOPPED   Stop code EssentialContainerExited
Stopped reason  Essential container in task exited
Task definition migrate:2 ↗   Started by scheduler   Group family:migrate
Created / started / stopped   10:15:00 / 10:15:02 / 10:15:07
[Containers] [Logs]
```

- `DescribeTasks`. Task không có (`failures: MISSING`) → "Task … not found. Floci doesn't keep tasks across restarts." kèm link về tab Tasks.
- **Containers:** tên, image, last status, exit code, reason, command / env đã ghi đè (`overrides`).
- **Logs:** chọn container (chỉ container có `logDriver: awslogs`); stream `<awslogs-stream-prefix>/<container>/<taskId>`, group `awslogs-group` (lấy từ task definition). Bảng giống Lambda › Monitor: thời gian, message; nút làm mới, tự làm mới. Container không dùng `awslogs` → "This container doesn't send logs to CloudWatch Logs."
- **Stop:** `ConfirmModal` → `StopTask` (`reason: "Stopped from Local Console"`).

### 3.5 Service

**Create service — `/ecs/clusters/:cluster/services/create`:** tên (1–255: chữ, số, `-`, `_`), task definition (family + revision), desired count (≥ 0, mặc định 1), subnets, security groups (như Run task) → `CreateService` (`launchType: FARGATE`). Xong mở chi tiết.

**Chi tiết — `/ecs/clusters/:cluster/services/:service`:**

```text
api                                                     [Delete] [Update]
● Active · Desired 1 · Running 1 · Pending 0            Stack: AppStack ↗
Task definition api:3 ↗
[Tasks] [Events] [Configuration]
```

- `DescribeServices`; không có (`MISSING`) hoặc `INACTIVE` → "Service … not found".
- **Tasks:** `ListTasks` (`serviceName`), cùng bảng tab Tasks của cluster.
- **Events:** `events` (mới nhất trên): thời gian, message.
- **Configuration:** ARN, launch type, subnets, security groups, deployments (status, revision, rollout state, desired / running).
- `StackLink` type `AWS::ECS::Service`, physical ID = ARN service.

**Update (modal):** desired count, revision task definition → `UpdateService`. Mô tả: "Floci starts new tasks before stopping old ones; running count settles after a few seconds." (7 #10).

**Delete:** `ConfirmModal` gõ `delete` → `DeleteService` (`force: true`, như checkbox force delete của AWS). Floci dừng và xóa container của service.

### 3.6 Task definitions — `/ecs/task-definitions`

```text
Task definitions (3)                       [Active ▾]     [↻] [Create new task definition]
 Family ▲
 api
 migrate
```

- `ListTaskDefinitionFamilies` (`status`: Active / Inactive). Family mở danh sách revision. Không có cột revision mới nhất: cần gọi thêm một lần cho từng family.

**Revision — `/ecs/task-definitions/:family`:**

```text
migrate                                   [↻] [Delete] [Deregister] [Create new revision]
 ◯ Revision ▼   Status
 ◯ migrate:2    ● Active
 ◯ migrate:1    ○ Inactive
```

- `ListTaskDefinitions` (`familyPrefix`) một lần cho mỗi status (Active, Inactive, Delete in progress) để biết status mà không `Describe` từng revision, rồi lọc đúng family (prefix `api` cũng khớp `api-worker`).
- **Deregister** (chỉ Active) → `DeregisterTaskDefinition`. **Delete** (chỉ Inactive, như AWS) → `DeleteTaskDefinitions`; Floci giữ revision ở `DELETE_IN_PROGRESS` mãi (7 #9), danh sách hiện status đó.

**Chi tiết revision — `/ecs/task-definitions/:family/:revision`:**

- Kiểm revision có trong `ListTaskDefinitions` trước khi `DescribeTaskDefinition`: revision không có trả 400 `ClientException` (`console.error`, 7 #13).
- Header: ARN (copy), status, task role, execution role, network mode, cpu / memory, `StackLink` (`AWS::ECS::TaskDefinition`, physical ID = ARN). Nút **Run task**, **Create new revision**, **Deregister**.
- **Containers:** mỗi container một khối (không phải bảng nhiều cột, để điện thoại đọc được): image, essential, port mappings, command (mảng JSON), environment, **secrets** (`valueFrom` → link Secrets Manager theo ARN, SSM theo tên / ARN), log (`awslogs-group`, prefix).
- **JSON:** `CodeSnippet` nội dung `taskDefinition`.

**Create new task definition / Create new revision — `/ecs/task-definitions/create`:**

- `CodeEditor` JSON đầu vào của `RegisterTaskDefinition`. Tạo mới: mẫu busybox Fargate có `awslogs`. Revision mới: điền từ revision đang xem, bỏ các trường chỉ đọc (`taskDefinitionArn`, `revision`, `status`, `requiresAttributes`, `compatibilities`, `registeredAt`, `registeredBy`, `deregisteredAt`).
- Form chặn JSON hỏng, thiếu `family` hoặc `containerDefinitions`; còn lại để Floci báo. Xong mở chi tiết revision.

### 3.7 Thay đổi ở EventBridge (rule và schedule)

| Chỗ                        | Đổi                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `targets.ts`               | Thêm `ecs: "ECS task"` vào `TARGET_KINDS`, `ADDABLE_TARGET_KINDS`; `KIND_BY_ARN_SERVICE` thêm `ecs` (target ARN = ARN cluster)                                                                                                                   |
| Add target / Schedule form | Loại ECS task: chọn **Cluster**, **Task definition** (family + revision), **Subnets** (mặc định như 3.3) → `EcsParameters` (`TaskDefinitionArn`, `LaunchType: FARGATE`, `NetworkConfiguration`, `TaskCount: 1`), `RoleArn` mặc định như schedule |
| `TargetResource`           | Target ECS: link cluster và task definition (`EcsParameters.TaskDefinitionArn`)                                                                                                                                                                  |

Thiếu network config thì Floci chỉ ghi lỗi vào log của nó, rule / schedule vẫn báo thành công (7 #5): form luôn gửi subnet.

### 3.8 Thay đổi ở Step Functions và CloudFormation

- `stepfunctions/taskResource.ts`: `resourceType` `ecs` → tham số `Cluster` (tên hoặc ARN) → link chi tiết cluster, tab Tasks.
- `cloudformation/resourceLinks.ts`: `AWS::ECS::Cluster` (tên) → cluster; `AWS::ECS::Service` (ARN `…:service/<cluster>/<service>`) → service; `AWS::ECS::TaskDefinition` (ARN `…:task-definition/<family>:<revision>`) → revision.

---

## 4. Cách hoạt động của một số thao tác

| Thao tác                | Gọi                                                                           |
| ----------------------- | ----------------------------------------------------------------------------- |
| Danh sách cluster       | `ListClusters` + `DescribeClusters`                                           |
| Tạo / xóa cluster       | `CreateCluster` / `DeleteCluster`                                             |
| Services của cluster    | `ListServices` + `DescribeServices`                                           |
| Tạo / sửa / xóa service | `CreateService` / `UpdateService` / `DeleteService` (`force`)                 |
| Tasks                   | `ListTasks` (`desiredStatus`, `serviceName`) + `DescribeTasks`                |
| Run / stop task         | `RunTask` / `StopTask`                                                        |
| Log của task            | CloudWatch Logs `DescribeLogStreams` (kiểm có stream) + `GetLogEvents`        |
| Task definitions        | `ListTaskDefinitionFamilies`, `ListTaskDefinitions`, `DescribeTaskDefinition` |
| Tạo / revision mới      | `RegisterTaskDefinition`                                                      |
| Deregister / xóa        | `DeregisterTaskDefinition` / `DeleteTaskDefinitions`                          |
| Subnet, security group  | EC2 `DescribeSubnets`, `DescribeSecurityGroups`                               |

---

## 5. Trạng thái và lỗi

| Tình huống                            | Hiển thị                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Cluster / service / revision không có | "… not found" kèm link về danh sách (dò bằng Describe / List, không để 400, 7 #13)     |
| Task không có (sau khi Floci restart) | "Task … not found. Floci doesn't keep tasks across restarts."                          |
| Task không chạy được                  | `stopCode: TaskFailedToStart` + `stoppedReason` gốc (secret không có, image sai, 7 #4) |
| Container thoát lỗi                   | Exit code + `stopCode: EssentialContainerExited`                                       |
| `RunTask` trả `failures`              | Lỗi gốc từng failure                                                                   |
| Xóa cluster còn service / task        | Lỗi gốc `ClusterContainsServicesException` / `ClusterContainsTasksException`           |
| Lần đầu dùng một image                | `RunTask` chờ Floci pull xong (busybox ~6 s): nút giữ trạng thái loading               |
| JSON task definition hỏng             | Form chặn                                                                              |

---

## 6. Kỹ thuật

### Package cần cài

User tự chạy (từ thư mục gốc repo):

```bash
npm install @aws-sdk/client-ecs -w web --min-release-age=7
npm install @aws-sdk/client-ecs -w tests --min-release-age=7   # cho tests/it
```

`client-cloudwatch-logs`, `client-ec2`, `client-eventbridge`, `client-scheduler` đã có. Trên Windows, `npm install` có thể cắt binding `@rolldown/*` / `lightningcss-*` khỏi `package-lock.json`: xem diff lockfile trước khi commit.

### Cấu trúc thư mục

```bash
web/src/services/ecs/
├── index.tsx, routes.ts, constants.ts, schemas.ts
├── arns.ts                    # tên cluster / service / family:revision / task ID từ ARN
├── taskDefinitionJson.ts      # bỏ trường chỉ đọc khi tạo revision mới; log config của container
├── codeSamples.ts
├── hooks/                     # useEcs (client ECS, EC2, Logs), useClusters, useServices, useTasks, useTaskDefinitions, useTaskLogs, useNetworkOptions
├── pages/                     # ClusterList, ClusterDetail, RunTask, TaskDetail, CreateService, ServiceDetail, TaskDefinitionList, TaskDefinitionRevisions, TaskDefinitionDetail, TaskDefinitionEditor
└── components/                # ServicesTab, TasksTable, ContainersTab, TaskLogsTab, UpdateServiceModal, CreateClusterModal, NetworkFields, ContainerOverrides, ClusterLink, TaskDefinitionLink
```

Một dòng trong `registry.ts`; icon Tabler `IconContainer`. Route khai báo bằng `lazyPage`.

### Dùng lại từ phần đã có

| Thành phần                                                                                                                              | Dùng cho                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ActionBar`, `refreshAction`, `ConfirmModal`, `DeletePreview`, `FormModal`, `useZodForm`, `CodeSnippet`, `CodeEditor`, `KeyValueEditor` | Bảng, form, JSON, env override                                    |
| Lambda › Monitor: `logGroupExists`, cột bảng log, `LOG_REFRESH_INTERVAL_MS`                                                             | Tab Logs của task (chuyển sang `shared/` khi làm CloudWatch Logs) |
| `secretsRoutes.secretOfArn`, `ssmRoutes`                                                                                                | Link secret / parameter                                           |
| `StackLink`, `ConnectCard`, `codeSamples.ts` (`lines`, `literal`)                                                                       | Header, thẻ Connect                                               |
| EventBridge `buildTarget`, `useTargetOptions`, `TargetResource`                                                                         | Target ECS                                                        |

---

## 7. Rủi ro đã kiểm tra

Chạy thử trên Floci 2.4.0 ngày 2026-11-26 (compose hiện tại: `FLOCI_SERVICES_EC2_VPC_NETWORKS_ENABLED: "false"`), region `ap-southeast-1`, Python stdlib gọi thẳng `:4566`; #13 thêm qua proxy `/aws` của console. Resource tạm đã xóa. Phần cũ hơn: [khảo sát 2026-11-19](../researchs/2026-11-19-floci-survey/ecs-athena.md) (CloudFormation, ECR, ELB, port, metadata endpoint).

| #   | Rủi ro                            | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Run task Fargate**              | **Ổn.** Container Docker thật `floci-aws-ecs-<taskId>-<container>`. `DescribeTasks`: `exitCode`, `stopCode`, `stoppedReason`, `startedBy`, `group`. Override command + env đúng                                                                                                                                                                                                                                                                                                    |
| 2   | **Secrets Manager, SSM**          | **Ổn.** `secrets.valueFrom` (ARN secret, tên parameter `SecureString`) → container nhận đúng giá trị                                                                                                                                                                                                                                                                                                                                                                               |
| 3   | **CloudWatch Logs**               | **Ổn.** Stream `<prefix>/<container>/<taskId>`, `GetLogEvents` đủ stdout. Floci inject `AWS_ENDPOINT_URL=http://localhost.floci.io:4566`, credential `test`, region                                                                                                                                                                                                                                                                                                                |
| 4   | **Lỗi hay gặp**                   | Secret không có → `TaskFailedToStart`, `ResourceInitializationError: unable to pull secrets … can't find the specified secret`. Image sai → `TaskFailedToStart`, `repository … not found`. Log group chưa có → Floci **tự tạo** (AWS: task lỗi, trừ khi `awslogs-create-group`)                                                                                                                                                                                                    |
| 5   | **EventBridge**                   | **Ổn.** Event `ECS Task State Change` vào default bus đủ 8 trạng thái (PROVISIONING → STOPPED), thiếu `stopCode`. Rule target ECS (`EcsParameters`) chạy task, `startedBy: eventbridge`. Thiếu network config: Floci chỉ ghi `INVALID_PARAMETER` vào log của nó                                                                                                                                                                                                                    |
| 6   | **Scheduler**                     | **Ổn.** Schedule target ECS chạy task, `startedBy: scheduler`. Thiếu network config: lỗi chỉ trong log Floci                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | **Step Functions**                | **Ổn.** `ecs:runTask` SUCCEEDED, output có `TaskArn`. `ecs:runTask.sync` chờ task xong; exit ≠ 0 → FAILED `States.TaskFailed`, cause `Essential container in task exited`                                                                                                                                                                                                                                                                                                          |
| 8   | **Stop task**                     | **Ổn.** `stopCode: UserInitiated`, `stoppedReason` = reason truyền vào, exit 137, container bị xóa                                                                                                                                                                                                                                                                                                                                                                                 |
| 9   | **Xóa task definition**           | Deregister → INACTIVE. `DeleteTaskDefinitions` → `DELETE_IN_PROGRESS` mãi (khảo sát A3)                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | **Service**                       | `desiredCount: 1` → steady state trong vài giây; update 0 dừng task sau vài giây. **`DeleteService` `force` không dừng task đang chạy của service** (AWS thì dừng; kiểm lại 2026-11-26, khảo sát A1 ghi sai): task mồ côi chạy mãi, cluster không xóa được. Console không tự dừng thay; modal xóa nhắc dừng ở tab Tasks. Update: bật task mới rồi tắt cũ (khảo sát A1)                                                                                                             |
| 11  | **Network**                       | `awsvpc` không có `networkConfiguration` → `InvalidParameterException`. Subnet phải tồn tại; `DescribeSubnets` có `subnet-default-<region>-a/b/c` (`defaultForAz`), security group `default`                                                                                                                                                                                                                                                                                       |
| 12  | **Floci restart**                 | Cluster, task definition, service còn; service bật lại task. **Task không được lưu:** task chạy lẻ và lịch sử STOPPED mất, `DescribeTasks` → `MISSING`                                                                                                                                                                                                                                                                                                                             |
| 13  | **Resource không có, qua `/aws`** | `DescribeClusters` / `DescribeServices` / `DescribeTasks` → 200 + `failures: MISSING`. `DescribeTaskDefinition` → 400 `ClientException`; `ListTasks` / `ListServices` / `DescribeTasks` / `DescribeServices` với cluster lạ → 400 `ClusterNotFoundException` (trang task / service hỏi `DescribeClusters` trước; `DescribeClusters` tên `default` không tạo cluster). Riêng tên `default`: `RunTask` không có `cluster`, `ListTasks` / `ListServices` **tự tạo** cluster `default` |
| 14  | **RDS từ task**                   | **Ổn.** Task tới được endpoint RDS Floci trả (IP compose) và Floci qua `localhost.floci.io:4566`                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 8. Thứ tự làm

1. User cài package (mục 6). Icon, khai báo trong `registry.ts`, `useEcs`.
2. Hàm thuần + unit test: `arns.ts`, `taskDefinitionJson.ts` (bỏ trường chỉ đọc, lấy log config), parse command override.
3. Clusters: danh sách, tạo, xóa, chi tiết (Services, Tasks), Connect.
4. Task definitions: family, revision, chi tiết, tạo / revision mới, deregister, xóa.
5. Tasks: Run task, chi tiết, Logs, Stop.
6. Services: tạo, chi tiết, sửa, xóa.
7. EventBridge target ECS (rule, schedule), Step Functions link, `StackLink` và `resourceLinks.ts`.
8. Test: integration `tests/it/ecs.test.ts` (đăng ký task definition có secret + `awslogs`, run task, đọc exit code và log, stop task, service lên 1 task, xóa); E2E một luồng chính; trang danh sách vào `tests/ui/responsive.spec.ts`; cluster / family `lc-it-*` / `lc-e2e-*` vào `tests/it/leftovers.mjs`. Image busybox Floci pull lần đầu (cần mạng).
9. `docs/development.md` › Traps: task mất sau restart, cluster `default` tự tạo, log group tự tạo, lỗi target ECS chỉ trong log Floci.

**Kiểm tra:** chạy trên Floci thật, chụp 1440, 1024 và 390px, không trang nào cuộn ngang. Trọn luồng: Create cluster → Create task definition (busybox, secret, `awslogs`) → Run task ghi đè env → task Stopped, exit code đúng, tab Logs có output, secret link sang Secrets Manager → Create service desired 1 → task Running → Update desired 0 → Delete service → EventBridge rule target ECS + Send events → tab Tasks có task `startedBy: eventbridge` → Delete cluster.

**Kết quả thử (2026-11-26, Floci 2.4.0, console bản Docker):** unit 563/563 (web) + 12/12 (server), IT 195/195 (`ecs.test.ts` 15/15: secret / parameter, log, EventBridge, Scheduler, Step Functions `ecs:runTask.sync`), E2E 215/215 (`ecs.spec.ts` 10/10, `ecs-integrations.spec.ts` 3/3: target ECS thêm từ form rule, bước Step Functions link cluster, stack CloudFormation link hai chiều; 3 spec không phải ECS fail ở lượt đầu vì máy chậm, chạy lại pass), UI 252/252, UX 11/11, mobile 36/36. Xem tay 1440 / 1024 / 390px: không cuộn ngang, không `console.error`.

---

## 9. Quyết định

| Quyết định                                                 | Lý do                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Làm ECS trước MCP, DocumentDB, CloudWatch Logs             | Floci chạy thật, nối được Secrets / SSM / Logs / EventBridge / Scheduler / Step Functions. User chọn 2026-11-26 |
| CRUD đủ cho cluster, task definition, service, task        | User chốt 2026-11-26: CRUD tài nguyên chính luôn làm khi Floci hỗ trợ                                           |
| Chỉ Fargate                                                | Đoán Fargate phổ biến; EC2 launch type để sau                                                                   |
| Task definition sửa bằng JSON, không làm form từng trường  | Đơn giản, dev dán được từ CDK / CLI; giống tab JSON của AWS                                                     |
| Subnet chọn từ `DescribeSubnets`, mặc định subnet mặc định | Floci bắt buộc subnet có thật (7 #11); dùng thẳng dữ liệu Floci trả                                             |
| Tab Logs đọc stream của task, dùng lại phần log của Lambda | Nối CloudWatch Logs; trang Logs riêng làm sau cùng (roadmap)                                                    |
| Link secret / parameter không kiểm có tồn tại              | Đơn giản; secret không có thì task báo `TaskFailedToStart` rõ ràng (7 #4)                                       |
| Dò resource bằng Describe / List trước                     | Tránh 400 → `console.error`, và tránh tự tạo cluster `default` (7 #13)                                          |
| Không sửa server                                           | ECS là AWS API thuần, đi qua proxy `/aws`                                                                       |
