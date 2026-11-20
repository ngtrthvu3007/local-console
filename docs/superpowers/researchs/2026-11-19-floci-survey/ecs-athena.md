# Ghi chú tạm: ECS và Athena trên Floci 2.4.0 (khảo sát 2026-11-19)

Cách kiểm: gọi thật vào `http://localhost:4566` (Floci `floci/floci:2.4.0` của compose), region `ap-southeast-1`, Python stdlib + `curl`, quan sát `docker ps/inspect/logs/events`. Không đọc theo tài liệu — mọi dòng ✅/❌ dưới đây đều có request thật.

---

## A. ECS

### A1. Action / tính năng

| Tính năng | KQ | Bằng chứng |
|---|---|---|
| Cluster CRUD (`CreateCluster`, `DescribeClusters` + `include: TAGS, STATISTICS`, `ListClusters`, `DeleteCluster`) | ✅ | Trả đủ `statistics` (running/pending EC2/Fargate), tags. `DeleteCluster` khi còn service → `ClusterContainsServicesException` (giống AWS) |
| `PutClusterCapacityProviders`, `DescribeCapacityProviders` | ✅ | Trả `FARGATE` ACTIVE |
| Task definition: `RegisterTaskDefinition` (revision tăng), `ListTaskDefinitions`, `ListTaskDefinitionFamilies`, `DeregisterTaskDefinition` → INACTIVE, `DeleteTaskDefinitions` → `DELETE_IN_PROGRESS` | ✅ | rev 1 → rev 2 cùng family. Không có `requiresCompatibilities` → `networkMode: bridge`, `compatibilities: [EC2, EXTERNAL]` (giống AWS) |
| Container definition: image, `portMappings`, `environment`, `secrets`, `logConfiguration awslogs`, cpu/memory | ✅ | Đều được lưu và áp dụng khi chạy (xem dưới). Docker `Memory=512MB`, `NanoCpus=0.25` cho task cpu 256 / memory 512 |
| Container `healthCheck` | ❌ | Được lưu trong task def nhưng **không** truyền sang Docker (`Config.Healthcheck = null`), `healthStatus` luôn `UNKNOWN` |
| `RunTask` launch type FARGATE (awsvpc) | ✅ | Chạy container Docker thật tên `floci-aws-ecs-<taskId>-<containerName>`, label `io.floci.service=ecs`, `io.floci.resource-id=<taskId>`, nối vào network compose `local-console_default`. **Subnet phải tồn tại** (`subnet-1` → `InvalidParameterException`); dùng subnet mặc định `subnet-default-ap-southeast-1-a/b/c` |
| `RunTask` launch type EC2 | ✅ | Chạy được **không cần container instance** (`ListContainerInstances` rỗng). Bridge mode |
| Không truyền `launchType` | ⚠️ | Floci mặc định FARGATE (AWS: theo capacity provider strategy mặc định của cluster, không có thì EC2) |
| Floci tự pull image | ✅ | `public.ecr.aws/docker/library/busybox:latest`, `public.ecr.aws/nginx/nginx:alpine` không có sẵn → Floci tự pull. `RunTask` **chặn tới khi pull xong** (~6 s lần đầu) và trả luôn `lastStatus: RUNNING` |
| `DescribeTasks` | ✅ | `lastStatus`, `desiredStatus`, `containers[].exitCode`, `runtimeId` (= Docker container id), `imageDigest`, `stopCode` (`EssentialContainerExited` / `UserInitiated`), `stoppedReason`, `startedBy` (`eventbridge`, `scheduler`, `ecs-svc/...`), timestamps |
| Task tự kết thúc → tự cập nhật trạng thái | ✅ | busybox `exit 3` → STOPPED, `exitCode: 3`, `stopCode: EssentialContainerExited`. Container Docker bị xóa ngay sau khi dừng |
| `StopTask` | ✅ | `stopCode: UserInitiated`, `stoppedReason` = reason truyền vào; container Docker bị xóa |
| `ListTasks` (lọc `desiredStatus`, `family`, `serviceName`) | ✅ | STOPPED task còn liệt kê được |
| Override `command` + `environment` | ✅ | Log in ra `PLAIN=overridden EXTRA=x1`; `overrides` lưu trong `DescribeTasks` |
| Network/IP trong `DescribeTasks` | ⚠️ | `attachments`/`networkInterfaces` trả IP **giả** dải VPC (`172.31.0.x`), không phải IP Docker thật (`172.28.0.x`) |
| Port: Fargate/awsvpc | ⚠️ | **Không** publish ra host (kể cả khi khai `hostPort: 80`). `networkBindings` vẫn báo `hostPort: 80` (sai). Từ container khác trong network compose gọi được bằng IP Docker hoặc tên container `floci-aws-ecs-<taskId>-<name>:80` → `HTTP 200` |
| Port: EC2 + bridge + `hostPort` cố định | ✅ | `hostPort: 18080` → Docker publish `0.0.0.0:18080->80` → `curl localhost:18080` = 200. Lưu ý bind `0.0.0.0` (lộ ra LAN) |
| Port: EC2/bridge + `hostPort: 0` (dynamic) | ❌ | Không publish, `networkBindings` báo `hostPort: 80` (AWS cấp ephemeral port) |
| Service: `CreateService` (desiredCount 2) | ✅ | 2 container chạy trong ~3 s, `rolloutState: COMPLETED`, event `has reached a steady state` |
| Service giữ đủ số task | ✅ | `docker stop` 1 container → trong < 5 s có task mới thay |
| `UpdateService` (revision mới + đổi desiredCount) | ⚠️ | Rolling kiểu "bật mới rồi tắt cũ" (thấy 5 container cùng lúc rồi còn 3). Chỉ có 1 deployment `PRIMARY`, không có deployment cũ `ACTIVE`/draining. `runningCount` ngay sau update báo 5 (gồm cả task cũ), vài giây sau mới đúng 3 |
| `DeleteService` | ✅ | Không `force` khi desired > 0 → lỗi giống AWS; `force: true` → INACTIVE, container bị xóa |
| `ListServices`, `DescribeServices` (events, deployments) | ✅ | |
| `ListServiceDeployments` | ✅ | Có bản ghi; `DescribeServiceDeployments`/`DescribeServiceRevisions` trả rỗng |
| Service + load balancer (ELBv2 target group type `ip`) | ✅ | Target đăng ký bằng **IP Docker thật** (`172.28.0.3:80`), `initial` → `healthy`. ALB listener port 80 chạy **trong container Floci** (`ElbV2DataPlane ... listener port started on 80`): gọi từ trong Floci = 200; từ host không gọi được vì compose chỉ publish 4566 (và 6379-6399). Xóa service → target bị gỡ |
| `ExecuteCommand` | ⚠️ có | Task chạy với `enableExecuteCommand: true` → trả `session.streamUrl` `ws://localhost:4566/v1/data-channel/...` + token. Không kiểm phía websocket |
| Container instance (`ListContainerInstances`, `UpdateContainerInstancesState`) | có (rỗng) | Không cần để chạy EC2 launch type |
| Tags (`TagResource`, `ListTagsForResource`), `ListAccountSettings` | ✅ | |
| Task metadata endpoint v4 | ❌ | Có inject `ECS_CONTAINER_METADATA_URI_V4=http://localhost.floci.io:4566/v4/<id>` nhưng `GET` → 404 (cả `/task`) |
| Env Floci tự inject vào container | ℹ️ | `AWS_ENDPOINT_URL=http://localhost.floci.io:4566`, `AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN=test`, `AWS_REGION`, `FLOCI_ENDPOINT`. `localhost.floci.io` resolve ra IP container Floci → app trong task gọi SDK vào Floci được ngay. Tên service `floci:4566` cũng gọi được |

### A2. Điểm nối

| Điểm nối | KQ | Bằng chứng |
|---|---|---|
| CloudWatch Logs (`awslogs`) | ✅ | Log container vào log group `awslogs-group`, stream `<awslogs-stream-prefix>/<containerName>/<taskId>` (vd `bb/main/d9fa6d94...`). `GetLogEvents` thấy đủ stdout. Ngoài ra Floci luôn in stdout container vào `docker logs` của Floci (`[ecs:<family>:<container>]`) |
| Secrets Manager (`secrets.valueFrom` = ARN secret) | ✅ | Container in `MYSEC=s3cr3t-val` (Floci gọi `GetSecretValue` lúc start) |
| SSM Parameter Store (`secrets.valueFrom` = tên param, `SecureString`) | ✅ | Container in `MYPARAM=param-val` |
| ECR của Floci | ✅ | `CreateRepository` → `repositoryUri = 000000000000.dkr.ecr.ap-southeast-1.localhost:4566/<repo>`; `docker tag` + `docker push` vào URI đó chạy được (không cần login); task dùng image đó → Floci pull từ registry nội bộ (`floci-aws-ecr-registry`, host port 5100) và chạy (`from-ecr` trong log) |
| IAM task role | ⚠️ | `taskRoleArn` chỉ lưu. Container nhận credential tĩnh `test/test` qua env, không có `AWS_CONTAINER_CREDENTIALS_*` (tài liệu: cần `FLOCI_SERVICES_ECS_TASK_ROLE_CREDENTIALS_ENABLED=true`, không bật) |
| EventBridge — event `ECS Task State Change` vào default bus | ✅ | Rule `{"source":["aws.ecs"]}` → SQS nhận event với `lastStatus` lần lượt `PROVISIONING`, `PENDING`, `ACTIVATING`, `RUNNING`, `DEACTIVATING`, `STOPPING` (…), `detail` có `taskArn`, `clusterArn`, `containers`, `startedBy` |
| EventBridge rule target ECS (`EcsParameters`) | ✅ | `PutEvents` khớp rule → Floci chạy `RunTask` thật, `startedBy: eventbridge` |
| EventBridge Scheduler target ECS | ✅ | Schedule `rate(1 minute)` → task thật, `startedBy: scheduler` |
| ELBv2 target group | ✅ | Xem A1 (đăng ký IP thật, health `healthy`) |
| CloudFormation `AWS::ECS::Cluster`, `TaskDefinition`, `Service` | ✅ thật | Stack `CREATE_COMPLETE`, cluster/TD/service có thật, service chạy container nginx thật; `Fn::GetAtt Arn`, `Ref` (TD → ARN, Service → ARN) đúng. `DeleteStack` xóa cluster, gỡ TD, dừng container |
| Step Functions `ecs:runTask.sync` | chưa kiểm | Để agent SFN (Athena `.sync` thì Floci 2.4.0 báo `Unsupported resource` — xem B2, có thể ECS `.sync` cũng vậy) |

### A3. Floci khác tài liệu / khác AWS

- Tài liệu: "RunTask trả về trước khi pull image, task chuyển PROVISIONING → RUNNING ở nền". 2.4.0: `RunTask` **chặn tới khi pull xong** và trả `RUNNING` ngay.
- Tài liệu: có metadata endpoint v4. 2.4.0: URL inject trả 404.
- Healthcheck container không áp dụng → `healthStatus` luôn `UNKNOWN`.
- IP trong `DescribeTasks` là IP VPC giả, không phải IP gọi được. `networkBindings.hostPort` báo sai khi không publish (Fargate, hoặc `hostPort: 0`).
- Không có `launchType` → FARGATE (AWS → EC2 nếu cluster không có default strategy).
- EC2 launch type không cần container instance; Fargate chấp nhận cả `networkMode: bridge`.
- Port publish bind `0.0.0.0`; container sidecar `floci-aws-duck` (Athena) cũng publish `0.0.0.0:<random>`.
- Task definition sau `DeleteTaskDefinitions` đứng mãi ở `DELETE_IN_PROGRESS` (AWS cũng vậy tới khi hết tham chiếu; Floci chưa thấy dọn).
- 1 lần chạy nginx: container biến mất sau < 1 s với exit 0, Floci 70 s sau mới reconcile STOPPED. Không tái hiện ở 5+ lần chạy sau; nghi do agent khác dọn container `floci-aws-*` song song — **không kết luận**.

### A4. Gợi ý thô

| Tính năng | Đề xuất | Ghi chú |
|---|---|---|
| Cluster list/detail (stats) | Làm (nếu làm ECS) | Rẻ |
| Task definition: list family/revision, xem JSON container definitions, register revision mới (JSON editor), deregister | Làm | Cần để `RunTask`/service; tiêu chí nối Secrets/SSM/Logs |
| Task: list (RUNNING/STOPPED), detail (status, exitCode, stopCode, stoppedReason, startedBy), `RunTask` với override command/env, `StopTask` | Làm | Thói quen chạy batch job/one-off (đoán) |
| Link "Xem log" sang trang CloudWatch Logs (group + stream `prefix/container/taskId`) | Làm | Điểm nối quan trọng; tên stream tính được từ task def + taskId |
| Link secret/param từ container definition sang trang Secrets Manager / SSM | Làm (khi 2 trang đó có) | |
| Service: list/detail/events, update desiredCount + revision, delete (force) | Để sau | Team chạy app bằng compose; chỉ cần khi có dự án deploy service (đoán) |
| Hiển thị cách gọi port task | Làm dạng ghi chú | Fargate: chỉ gọi được trong network compose bằng `floci-aws-ecs-<taskId>-<container>`; EC2 + hostPort cố định mới ra host. Không hiện IP `172.31.x` như thể gọi được |
| Load balancer, ExecuteCommand, container instance, capacity provider | Không làm | ELB đã "Không làm" trong roadmap; Exec cần websocket SSM protocol |
| Dropdown target ECS trong trang EventBridge/Scheduler | Để sau | Floci chạy thật, nhưng chỉ có ích khi có dự án dùng |

- **Backend:** không cần sửa. Mọi thứ là ECS JSON 1.1 qua proxy `/aws` (SDK `@aws-sdk/client-ecs` trong trình duyệt). Log đọc qua CloudWatch Logs API. Không cần chạm Docker.
- **Ước lượng:** M (cluster + task def + task + link log); thêm service: +S.
- **Đưa lên sớm hơn?** Không, trừ khi có dự án chạy batch bằng EventBridge/Scheduler → ECS. Lý do roadmap ("team chạy bằng compose") vẫn đúng; nhưng nên sửa dòng roadmap: EC2 launch type chạy được (không cần container instance), port task Fargate **không** ra host — chỉ gọi được trong network compose; EC2 + `hostPort` cố định mới ra host.

### A5. Chưa kiểm được

- Websocket của `ExecuteCommand` (cần client SSM session protocol).
- `dependsOn`, nhiều container trong 1 task, FireLens, volume/EFS.
- Task role credentials (cần đổi env Floci → không restart Floci theo yêu cầu).
- Hành vi sau restart Floci (tài liệu: task in-memory, service khởi động lại task) — cấm restart.
- SFN `ecs:runTask.sync` (agent SFN).

### A6. Đã dọn

- Cluster `lc-probe-ecs-c1`, `lc-probe-ecs-c2`, stack `lc-probe-ecs-stack` (và cluster/TD/service của nó): đã xóa, `ListClusters` = `[]`.
- Service `lc-probe-ecs-svc`, `lc-probe-ecs-lbsvc`: INACTIVE (đã xóa).
- Task definition: 0 ACTIVE, 0 INACTIVE; còn 10 bản `DELETE_IN_PROGRESS` (`lc-probe-ecs-*`) — Floci không dọn tiếp, API không xóa thêm được.
- Container Docker `floci-aws-ecs-*`: **0** (`docker ps -a`).
- Log group `/ecs/lc-probe-ecs`, secret `lc-probe-ecs-sec`, param `/lc-probe-ecs/param`, ECR repo `lc-probe-ecs-repo` (+ tag local đã `docker rmi`), rule `lc-probe-ecs-rule*`, schedule `lc-probe-ecs-sched`, queue `lc-probe-ecs-q`, ALB `lc-probe-ecs-alb`, TG `lc-probe-ecs-tg`: đã xóa, kiểm lại = 0.
- Còn lại do Floci pull (không phải tôi pull): image `public.ecr.aws/docker/library/busybox:latest`, `public.ecr.aws/nginx/nginx:alpine`. Muốn xóa: `docker rmi public.ecr.aws/docker/library/busybox:latest public.ecr.aws/nginx/nginx:alpine`.

---

## B. Athena

Engine: sidecar `floci-aws-duck` (image `floci/floci-duck:latest`, Floci tự pull, query đầu ~12 s), DuckDB. Mọi `SELECT` bị bọc thành `COPY (<sql>) TO 's3://.../<qid>.csv'`.

### B1. Action / tính năng

| Tính năng | KQ | Bằng chứng |
|---|---|---|
| Workgroup `Create/Get/List/Update/Delete` | ✅ | `UpdateWorkGroup` đổi description được; `DeleteWorkGroup` + `RecursiveDeleteOption` OK; `primary` có sẵn |
| Workgroup `OutputLocation` | ❌ | Bị **bỏ qua** (kể cả `EnforceWorkGroupConfiguration: true`): kết quả vẫn ghi `s3://floci-athena-results/results/<qid>.csv` |
| `ResultConfiguration.OutputLocation` theo query | ✅ | Ghi đúng `s3://lc-probe-athena-out/q/<qid>.csv` |
| Data catalog (`ListDataCatalogs`, `GetDataCatalog`, `Create/Update/DeleteDataCatalog`) | ✅ | Có `AwsDataCatalog` (GLUE); tạo/xóa catalog HIVE được (chỉ metadata) |
| `ListDatabases`, `ListTableMetadata`, `GetTableMetadata` | ✅ | Đọc từ Glue; type Glue `string` hiển thị `varchar` |
| `GetDatabase` (Athena) | ❌ | `Action GetDatabase is not supported` |
| Glue `CreateDatabase`, `CreateTable` (StorageDescriptor → S3), `GetTables`, `DeleteTable`, `BatchCreatePartition` | ✅ | |
| Bảng CSV (OpenCSVSerde + `skip.header.line.count`) | ✅ | Đọc đúng 3 dòng, quote/JSON trong cột OK |
| Bảng CSV (LazySimpleSerDe, `field.delim`) | ✅ | Đọc đúng |
| Bảng JSON (JsonSerDe), `array<int>`, `struct<...>` | ✅ | `meta.city` OK; `CROSS JOIN UNNEST(items)` OK |
| Bảng partition JSON (`region=eu/`, `region=us/`) | ⚠️ | Đọc được, cột partition có. Nhưng đọc **mọi thư mục** dù chỉ đăng ký 1 partition (tài liệu nói chỉ đọc partition đã đăng ký) |
| Bảng partition CSV **không header** (LazySimpleSerDe) | ❌ nghiêm trọng | Lỗi `Binder Error: Column "id" referenced ... before it is defined` — và **làm hỏng mọi query khác trong cùng database** (cả `t_csv` vốn chạy được) cho tới khi xóa bảng đó |
| Parquet | chưa kiểm | Không tạo được file Parquet bằng stdlib; CTAS/UNLOAD cũng không chạy (dưới) |
| `StartQueryExecution` → `GetQueryExecution` | ⚠️ | Status SUCCEEDED/FAILED/CANCELLED đúng; lỗi nằm ở `StateChangeReason` dạng `floci-duck execute returned HTTP 500: {...DuckDB message...}`, **không** có `AthenaError` (ErrorCategory/ErrorType). FAILED thì `CompletionDateTime: null`. `Statistics` giả: luôn `EngineExecutionTimeInMillis: 1`, `DataScannedInBytes: 0`. `StatementType` gần như luôn `DML` (kể cả `CREATE VIEW`, `DROP TABLE`); chỉ `CREATE DATABASE` → `DDL` |
| `GetQueryResults` | ⚠️ | Hàng đầu là header (giống AWS). **Mọi cột `Type: varchar`** (kể cả `int`, `double`, `count(*)`). **Không phân trang**: bỏ qua `MaxResults`, không có `NextToken`. Tên cột tự sinh kiểu DuckDB (`count_star()`, `name_1`) thay vì `_col0`. Struct in `{'city': hn}` (AWS: `{city=hn}`) |
| Kết quả ghi CSV ra S3 | ✅ | File `<qid>.csv` có thật, không có `<qid>.csv.metadata` |
| `StopQueryExecution` | ✅ | → `CANCELLED` |
| `ListQueryExecutions` (theo workgroup, có `NextToken`) | ✅ | |
| `BatchGetQueryExecution`, `GetQueryRuntimeStatistics`, `ListEngineVersions` | ❌ | `is not supported` |
| Named query (`Create/Get/List/Update/Delete/BatchGetNamedQuery`) | ❌ | **Tất cả** `Action ... is not supported` (tài liệu nói có) |
| Prepared statement API (`CreatePreparedStatement`, `List…`, `Get…`) | ❌ | `not supported` |
| `ExecutionParameters` (`?`) | ❌ | Bị bỏ qua → `Expected 2 parameters, but none were supplied` (tài liệu nói có) |
| SQL `PREPARE` / `EXECUTE ... USING` | ❌ | Parser Error |
| DDL `CREATE EXTERNAL TABLE` (mọi dạng: ROW FORMAT DELIMITED / SERDE / STORED AS PARQUET) | ❌ | `Parser Error: syntax error at or near "EXTERNAL"` (tài liệu nói có) |
| `MSCK REPAIR TABLE`, `ALTER TABLE ADD PARTITION`, `SHOW PARTITIONS/TABLES/DATABASES/CREATE TABLE`, `DESCRIBE`, `EXPLAIN` | ❌ | Parser Error |
| `CREATE DATABASE` qua Athena | ✅ | Tạo Glue database thật |
| `CREATE VIEW` | ❌ giả | Trả SUCCEEDED nhưng không lưu (query view sau đó → table not exist; Glue không có) |
| CTAS `CREATE TABLE ... WITH (format=...)` | ❌ | `WITH clause is not supported for tables in a duckdb catalog` |
| CTAS không `WITH` | ❌ giả | SUCCEEDED nhưng bảng không tồn tại ở query sau, không có trong Glue |
| `UNLOAD` | ❌ | Parser Error |
| `DROP TABLE IF EXISTS` | ⚠️ | SUCCEEDED (không kiểm xóa bảng có thật) |
| Query chéo database `db.table`, JOIN | ✅ | |
| Workgroup tags (`TagResource`, `UntagResource`, `ListTagsForResource`) | có | Cả 3 trả 200; chưa kiểm tag có lưu thật không (đã untag trước khi list) |

### B1b. SQL đặc thù Trino/Athena chạy trên DuckDB

| SQL | KQ trên Floci |
|---|---|
| `date_parse(ts, '%Y-%m-%d %H:%i:%s')` | ❌ function không tồn tại |
| `from_iso8601_timestamp(ts)` | ❌ |
| `json_extract_scalar(payload, '$.k')` | ❌ (tài liệu nói JSON function được "bridge") |
| `json_extract(payload, '$.k')` | ✅ nhưng trả `"v1"` (có ngoặc kép, kiểu JSON) |
| `json_array_get` | ❌ |
| `approx_distinct` | ❌ (DuckDB: `approx_count_distinct`) |
| `regexp_like` | ❌ |
| `date_format`, `array_join` | ❌ |
| `cardinality(array)` | ❌ (DuckDB chỉ cho MAP) |
| `element_at(array, 1)` | ❌ |
| `CROSS JOIN UNNEST(arr) AS t(x)` | ✅ |
| `CAST(x AS decimal(10,2))`, `try_cast` | ✅ |
| `try(1/0)` | ⚠️ trả `inf` (Trino: lỗi chia 0 → `try` trả NULL) |
| `typeof(x)` | ✅ nhưng trả tên DuckDB (`DOUBLE`) |
| Cú pháp sai `SELEC 1` | FAILED, message Parser Error của DuckDB |

=> Phần lớn hàm hay dùng của Athena **lỗi** trên Floci 2.4.0. Ngược lại, câu chạy được ở local có thể dùng hàm DuckDB không có trên Athena.

### B2. Điểm nối

| Điểm nối | KQ | Bằng chứng |
|---|---|---|
| S3 dữ liệu | ✅ | DuckDB đọc S3 của Floci qua `localhost.floci.io:4566` |
| S3 output | ⚠️ | Chỉ theo `ResultConfiguration` của query; workgroup output bị bỏ qua → mặc định bucket `floci-athena-results` (Floci tự tạo) |
| Glue catalog | ✅ | Database/table/partition Glue → view DuckDB. Một bảng lỗi làm hỏng cả database (B1) |
| Glue crawler | ❌ stub | `StartCrawler` → `LastCrawl.Status: SUCCEEDED` nhưng **0 bảng**, `TablesCreated: 0`, log rỗng |
| CloudFormation `AWS::Athena::WorkGroup`, `AWS::Athena::NamedQuery`, `AWS::Glue::Database`, `AWS::Glue::Table` | ❌ stub | Stack `CREATE_COMPLETE`, PhysicalId dạng `WG-1d92bb81`, nhưng `GetWorkGroup`/`GetDatabase`/`GetTable` → not found |
| Step Functions `athena:startQueryExecution.sync` | ❌ | Execution FAILED `States.TaskFailed: Unsupported resource: arn:aws:states:::athena:startQueryExecution.sync` |
| Lambda gọi Athena | chưa kiểm | Lambda của Floci có `AWS_ENDPOINT_URL` nên SDK gọi được về lý thuyết |
| Firehose/Kinesis → S3 → Athena | chưa kiểm | |

### B3. Floci khác tài liệu / khác AWS

Tài liệu Floci (bản mới) nói có nhưng 2.4.0 **không có**: named query, `ExecutionParameters`, Hive DDL (`CREATE EXTERNAL TABLE`, `MSCK REPAIR`, `ALTER TABLE ADD PARTITION`, `SHOW PARTITIONS`), bridge hàm JSON Trino, map type DuckDB → Athena trong `ColumnInfo`, "chỉ đọc partition đã đăng ký". Khác AWS: workgroup output bị bỏ qua, mọi cột varchar, không phân trang, không `AthenaError`, Statistics giả, tên cột tự sinh khác, struct format khác, CTAS/VIEW trả SUCCEEDED giả, sidecar publish `0.0.0.0`. Thêm: `GetDatabase`, `BatchGetQueryExecution`, `ListEngineVersions`, prepared statement API trả `not supported`.

### B4. Gợi ý thô

| Tính năng | Đề xuất | Ghi chú |
|---|---|---|
| Query editor: chọn workgroup + database, chạy SQL, xem trạng thái/lỗi, bảng kết quả | Để sau | Chạy được với SELECT cơ bản trên CSV/JSON qua Glue, nhưng hàm Trino thường dùng lỗi → giá trị thấp, dễ gây hiểu lầm |
| Danh sách database/table (Glue), xem cột | Để sau | |
| Lịch sử query (`ListQueryExecutions`) + link file kết quả sang trang S3 | Để sau | |
| Workgroup CRUD | Không làm | Output location của workgroup không có tác dụng |
| Named query / saved query, prepared statement, CTAS, view, DDL, crawler | Không làm | Floci 2.4.0 không hỗ trợ/giả |

- **Backend:** không cần sửa (Athena + Glue là JSON 1.1 qua `/aws`). Console phải tự: luôn truyền `ResultConfiguration.OutputLocation`, không tin `Type` cột, không phân trang, đọc lỗi từ `StateChangeReason`.
- **Ước lượng:** M (editor + kết quả + list Glue), dùng chung SQL editor với RDS như roadmap ghi.
- **Đưa lên sớm hơn?** Không. Nên giữ "Để sau" và **ghi thêm vào roadmap** cảnh báo cụ thể: hàm `date_parse`, `from_iso8601_timestamp`, `json_extract_scalar`, `approx_distinct`, `regexp_like`, `date_format`, `cardinality`… lỗi; Hive DDL, named query không có trong 2.4.0. Cân nhắc chuyển sang "Không làm" cho tới khi nâng Floci.

### B5. Chưa kiểm được

- Parquet (không tạo được file bằng stdlib, cấm cài lib; CTAS/UNLOAD không chạy).
- Iceberg, S3 Tables.
- Lambda/Firehose → Athena.
- Query chạy lâu thật để thấy trạng thái `RUNNING` (query nhỏ xong trong ~40 ms; `StartQueryExecution` có vẻ chạy đồng bộ).

### B6. Đã dọn

- Workgroup `lc-probe-athena-wg`: đã xóa (`ListWorkGroups` chỉ còn `primary`). Data catalog `lc-probe-athena-cat-x`: đã xóa.
- Glue database `lc_probe_athena_db`, `_db2`, `_db3`, `_crawl`, `_cfndb` (stub, không tồn tại) + mọi table, crawler `lc-probe-athena-crawler`: đã xóa, kiểm lại = 0.
- Bucket `lc-probe-athena-data`, `lc-probe-athena-out` + object: đã xóa. 19 file kết quả của tôi trong `floci-athena-results/results/`: đã xóa (bucket này còn, rỗng, do Floci tự tạo — không phải của tôi).
- Stack `lc-probe-athena-stack`: đã xóa. State machine `lc-probe-athena-sm`: đã xóa.
- Còn lại: container sidecar `floci-aws-duck` (Floci quản lý, dùng chung, để nguyên vì xóa có thể làm Floci lỗi) và image `floci/floci-duck:latest` do Floci pull.
