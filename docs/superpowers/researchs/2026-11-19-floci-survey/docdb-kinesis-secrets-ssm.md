# Ghi chú khảo sát Floci 2.4.0: DocumentDB, Kinesis, Secrets Manager, SSM Parameter Store

Ngày kiểm: 2026-11-19. Floci `floci/floci:2.4.0` (container `local-console-floci-1`, network `local-console_default`, region `ap-southeast-1`).
Mọi kết quả dưới đây là **kiểm thật** bằng request JSON/Query (Python stdlib), trừ chỗ ghi "tài liệu" hoặc "đoán".
Tài liệu Floci (https://floci.io/floci/services/docdb|kinesis|secrets-manager|ssm/) mô tả bản mới hơn 2.4.0 — nhiều chỗ lệch, ghi ở mục 3 từng service.

---

## A. DocumentDB

### A1. Action / tính năng

| Action / tính năng                                                    | Kết quả        | Bằng chứng                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateDBCluster` (Engine=docdb)                                      | ✅             | 200, `Status=available` ngay khi trả về. Lần đầu 25,5 s (gồm Floci tự pull `mongo:7.0`), lần sau vài giây. Bật container thật `floci-aws-docdb-<cluster>` (image `mongo:7.0`, MongoDB 7.0.48), env `MONGO_INITDB_ROOT_USERNAME/PASSWORD` = master user/password |
| Endpoint/Port trả về                                                  | ⚠️             | `Endpoint=172.28.0.10` (IP container trên network `local-console_default`), `Port=27017`, `ReaderEndpoint` = cùng IP. **Không publish port ra host** (`PortBindings={}`)                                                                                        |
| Kết nối TCP từ máy dev (host macOS)                                   | ❌             | Socket tới `172.28.0.10:27017` timeout; `localhost:27017` connection refused                                                                                                                                                                                    |
| Kết nối TCP từ container trong compose network                        | ✅             | `docker run --network local-console_default` (image `public.ecr.aws/lambda/python:3.12`) gửi OP_MSG `hello` → `isWritablePrimary: true, maxWireVersion: 21`. Gọi theo IP và theo tên container `floci-aws-docdb-lc-probe-docdb-c1` đều được                     |
| Auth                                                                  | ✅ bắt buộc    | `listDatabases` không auth → `Unauthorized (13) requires authentication`. `mongosh mongodb://admin1:secret999@172.28.0.10:27017/` → OK, tạo DB/collection được                                                                                                  |
| TLS                                                                   | ❌             | `tls=true` → "Client network socket disconnected before secure TLS connection was established". Chỉ chạy plain TCP (tài liệu ghi TLS là out of scope)                                                                                                           |
| `DescribeDBClusters` (theo id, filter `engine=docdb`)                 | ✅             | 200                                                                                                                                                                                                                                                             |
| `CreateDBInstance` / `DescribeDBInstances`                            | ✅             | 200, `available` ngay, endpoint instance = endpoint cluster. Chỉ là bản ghi, không bật container mới                                                                                                                                                            |
| `ModifyDBInstance` (class)                                            | ✅             | 200, `DBInstanceClass` đổi                                                                                                                                                                                                                                      |
| `ModifyDBCluster` `MasterUserPassword`                                | ⚠️             | 200 nhưng **mật khẩu Mongo không đổi**: login bằng mật khẩu cũ vẫn OK, mật khẩu mới → `Authentication failed`                                                                                                                                                   |
| `ModifyDBCluster` `ManageMasterUserPassword=true`                     | ❌             | 200 nhưng không có `MasterUserSecret`, không tạo secret                                                                                                                                                                                                         |
| `CreateDBCluster` `ManageMasterUserPassword=true` (không có password) | ❌ (bug)       | 200, container chạy với `MONGO_INITDB_ROOT_PASSWORD=null` (chuỗi "null"), không có secret                                                                                                                                                                       |
| `RebootDBInstance`                                                    | ❌             | `UnsupportedOperation: Operation RebootDBInstance is not supported by DocDB`                                                                                                                                                                                    |
| `StopDBCluster` / `StartDBCluster`                                    | ❌             | `UnsupportedOperation`                                                                                                                                                                                                                                          |
| `FailoverDBCluster`                                                   | ❌             | `UnsupportedOperation`                                                                                                                                                                                                                                          |
| `DescribeDBEngineVersions` (Engine=docdb)                             | ❌             | `UnsupportedOperation`                                                                                                                                                                                                                                          |
| `CreateDBClusterSnapshot`                                             | ❌             | `UnsupportedOperation` (tài liệu nói có, mongodump)                                                                                                                                                                                                             |
| `DescribeDBClusterSnapshots`                                          | ✅ (rỗng)      | 200, list rỗng                                                                                                                                                                                                                                                  |
| `AddTagsToResource` / `ListTagsForResource`                           | ✅             | 200, tag đọc lại được                                                                                                                                                                                                                                           |
| `DeleteDBInstance`                                                    | ✅             | 200                                                                                                                                                                                                                                                             |
| `DeleteDBCluster` còn instance                                        | ✅ (giống AWS) | `InvalidDBClusterStateFault ... still has DB instances`                                                                                                                                                                                                         |
| `DeleteDBCluster` (`SkipFinalSnapshot`)                               | ✅             | 200 trong 0,1 s, container bị xóa. **Nhưng volume ẩn danh của Mongo (`/data/db`, `/data/configdb`) bị bỏ lại** — đã tự xóa tay                                                                                                                                  |

### A2. Điểm nối

| Điểm nối                                                          | Kết quả             | Bằng chứng                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lambda kết nối DocDB                                              | ✅ (suy từ network) | Container Lambda của Floci nằm trên `local-console_default` (vd `floci-aws-lc-probe-sfn-fn-…` = `172.28.0.8`); từ container khác trên cùng network nối `Endpoint:27017` được (đã kiểm). Không kiểm bằng chính function Lambda vì runtime Node không có driver Mongo |
| Secrets Manager (master password)                                 | ❌                  | `ManageMasterUserPassword` không tạo secret (xem A1). Chỉ có thể tự lưu password vào secret bằng tay                                                                                                                                                                |
| CloudFormation `AWS::DocDB::DBCluster` / `AWS::DocDB::DBInstance` | ❌ stub             | Stack `CREATE_COMPLETE` nhưng event ghi "Resource type AWS::DocDB::DBCluster is not supported by Floci. It was stubbed and nothing was created". `GetAtt Endpoint` trả chuỗi `"C.Endpoint"`; `DescribeDBClusters` → `DBClusterNotFoundFault`                        |
| Liệt kê chung với RDS                                             | ✅                  | `DescribeDBClusters` không filter trả cả RDS lẫn DocDB (giống AWS); lọc bằng `engine=docdb`                                                                                                                                                                         |

### A3. Khác tài liệu / khác AWS

- Tài liệu: snapshot / restore / point-in-time có → 2.4.0: `CreateDBClusterSnapshot` `UnsupportedOperation` (restore không kiểm vì không có snapshot).
- Tài liệu: container tên `floci-aws-docdb-<account>-<region>-<cluster>` → 2.4.0: `floci-aws-docdb-<cluster>` (trùng tên cluster ở 2 region sẽ đụng nhau — đoán).
- Tài liệu: "Floci trên host → publish port động" — với compose của repo (Floci chạy trong container) thì endpoint là IP nội bộ, không publish.
- `AvailabilityZone=us-east-1a` dù region `ap-southeast-1`.
- `DBClusterMembers` trả phần tử `<member>` thay vì `<DBClusterMember>` như AWS → **AWS SDK v3 có thể đọc thành mảng rỗng** (chưa kiểm bằng SDK).
- `ModifyDBCluster` password trả 200 nhưng không áp dụng; `ManageMasterUserPassword` bị bỏ qua / làm password = "null".
- Không TLS (AWS DocDB bật TLS mặc định → connection string copy từ AWS có `tls=true&tlsCAFile=…` sẽ lỗi ở local).

### A4. Gợi ý thô

- **Để sau** (giữ như roadmap). Lý do: muốn xem dữ liệu phải có cầu nối MongoDB ở backend; CloudFormation chỉ stub; nhiều thao tác quản lý `UnsupportedOperation`.
- Nếu làm, phần quản lý (list/create/delete cluster + instance, tag, hiện endpoint) chạy trong trình duyệt bằng `@aws-sdk/client-docdb` qua `/aws` — nhớ kiểm `DBClusterMembers` có parse được không.
- **Cần sửa backend**: cầu nối Mongo như Redis (`server/src/routes/redis`), backend cần biết:
  - host = `Endpoint` (IP `172.28.x.x`) + port `27017` — chỉ tới được khi backend chạy **trong** compose network (`console` service). Backend chạy ngoài Docker (`npm run dev`) **không tới được** (khác Redis vì compose publish `6379-6399`). `reachableHost()` hiện có không giải quyết được (nó chỉ đổi `localhost`). Muốn chạy ngoài Docker phải đổi cách Floci chạy hoặc publish port — chưa kiểm.
  - auth: SCRAM với master username + password **người dùng tự nhập** (Floci không trả password, không có secret).
  - không TLS.
  - cần thêm package driver `mongodb` (người dùng tự cài).
- Ước lượng: **L** (backend bridge + driver + giới hạn network + UI duyệt document).
- Không nên đưa lên sớm hơn.

### A5. Chưa kiểm được

- `RestoreDBClusterFromSnapshot` / `RestoreDBClusterToPointInTime`: không tạo được snapshot.
- Chạy Mongo query từ chính một function Lambda: runtime Node không có driver, không được cài.
- Dữ liệu Mongo còn sau khi restart Floci không: cấm restart.
- `FLOCI_SERVICES_DOCDB_DOCKER_NETWORK` / mock mode: phải sửa compose.
- AWS SDK v3 có parse `DBClusterMembers` dạng `<member>` không: không cài SDK để thử.

### A6. Dọn dẹp

- Cluster `lc-probe-docdb-c1`, `lc-probe-docdb-c2`, instance `lc-probe-docdb-i1`, stack `lc-probe-docdb-stack`: đã xóa. `DescribeDBClusters` filter docdb → rỗng. 0 container `docdb`.
- 4 volume ẩn danh của 2 container Mongo (Floci không tự xóa): đã `docker volume rm` (đã kiểm nội dung là WiredTiger trước khi xóa). Image `mongo:7.0` do Floci pull vẫn còn.

---

## B. Kinesis Data Streams

### B1. Action / tính năng

| Action / tính năng                                                                                   | Kết quả        | Bằng chứng                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateStream` provisioned (`ShardCount=2`)                                                          | ✅             | `ACTIVE` ngay                                                                                                                                                                                                                                                                                                                                 |
| `CreateStream` on-demand (+ `Tags`)                                                                  | ✅             | `StreamMode=ON_DEMAND`, 1 shard, tag lưu                                                                                                                                                                                                                                                                                                      |
| `DescribeStream` / `DescribeStreamSummary`                                                           | ✅             | Có shard, hash range, `EncryptionType`, `StreamModeDetails`, `MaxRecordSizeInKiB`                                                                                                                                                                                                                                                             |
| `ListStreams`                                                                                        | ✅             | Có `StreamSummaries`                                                                                                                                                                                                                                                                                                                          |
| `ListShards`                                                                                         | ✅             | Có `ParentShardId`/`AdjacentParentShardId`, `EndingSequenceNumber` sau split/merge                                                                                                                                                                                                                                                            |
| `DeleteStream` (`EnforceConsumerDeletion`)                                                           | ✅             | 200                                                                                                                                                                                                                                                                                                                                           |
| `SplitShard`                                                                                         | ✅             | shard 0 đóng, sinh shard 2, 3 (parent 0)                                                                                                                                                                                                                                                                                                      |
| `MergeShards`                                                                                        | ✅             | shard 2+3 → shard 4 (parent 2, adjacent 3)                                                                                                                                                                                                                                                                                                    |
| `UpdateShardCount`                                                                                   | ✅ (giống AWS) | Trên stream on-demand → `ValidationException ... only supported for provisioned`                                                                                                                                                                                                                                                              |
| `UpdateStreamMode`                                                                                   | ✅             | on-demand → provisioned                                                                                                                                                                                                                                                                                                                       |
| `Increase/DecreaseStreamRetentionPeriod`                                                             | ✅             | 200                                                                                                                                                                                                                                                                                                                                           |
| `Start/StopStreamEncryption` (`alias/aws/kinesis`)                                                   | ✅             | `EncryptionType=KMS`, `KeyId` hiển thị                                                                                                                                                                                                                                                                                                        |
| `AddTagsToStream` / `ListTagsForStream` / `RemoveTagsFromStream`                                     | ✅             | 200                                                                                                                                                                                                                                                                                                                                           |
| `EnableEnhancedMonitoring`                                                                           | ✅             | 200 (chỉ lưu)                                                                                                                                                                                                                                                                                                                                 |
| `PutRecord` / `PutRecords`                                                                           | ✅             | `SequenceNumber`, `ShardId`, `FailedRecordCount=0`; chia shard theo MD5 partition key                                                                                                                                                                                                                                                         |
| `GetShardIterator` TRIM_HORIZON / LATEST / AT_TIMESTAMP / AT_SEQUENCE_NUMBER / AFTER_SEQUENCE_NUMBER | ✅             | Đủ 5 kiểu, số record đúng (LATEST = 0 với record cũ)                                                                                                                                                                                                                                                                                          |
| `GetRecords`                                                                                         | ✅             | `Data` base64, `PartitionKey`, `ApproximateArrivalTimestamp`, `MillisBehindLatest`                                                                                                                                                                                                                                                            |
| `RegisterStreamConsumer` / `ListStreamConsumers` / `DeregisterStreamConsumer`                        | ✅             | `ACTIVE` ngay                                                                                                                                                                                                                                                                                                                                 |
| `SubscribeToShard` (EFO)                                                                             | ⚠️             | 200, body binary EventStream (`initial-response` + 1 `SubscribeToShardEvent` chứa records) rồi đóng — snapshot, không phải stream lâu dài (đúng tài liệu)                                                                                                                                                                                     |
| Peek `GET /_aws/kinesis/records?StreamName=…[&Limit=n][&ShardId=…]`                                  | ✅ cần header  | **Cần header `Authorization` chứa region** (giống SQS peek). Thiếu header → `ResourceNotFoundException Stream … not found` (Floci tìm ở region mặc định); `?region=` không có tác dụng. Response `{"records":[{ShardId, SequenceNumber, PartitionKey, Data(base64), ApproximateArrivalTimestamp(ISO)}]}`. `Limit=2` trả 2 record **mới nhất** |
| `GET /_aws/kinesis/streams`                                                                          | ✅ cần header  | Như trên; trả mode, retention, encryption, `RecordCount` theo stream/shard, tags                                                                                                                                                                                                                                                              |

### B2. Điểm nối

| Điểm nối                                                  | Kết quả           | Bằng chứng                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lambda event source mapping từ Kinesis**                | ✅                | `POST /2015-03-31/event-source-mappings/` `StartingPosition=TRIM_HORIZON, BatchSize=3` → 4 record cũ tới Lambda thành 2 lần gọi (3 + 1)                                                                                                                                                                              |
| — event Lambda nhận                                       | ✅ đúng dạng AWS  | `Records[].kinesis{kinesisSchemaVersion, partitionKey, sequenceNumber, data(base64), approximateArrivalTimestamp}`, `eventSource=aws:kinesis`, `eventID=shardId-…:seq`, `eventName=aws:kinesis:record`, `invokeIdentityArn`, `awsRegion`, `eventSourceARN`                                                           |
| — `BisectBatchOnFunctionError` + `MaximumRetryAttempts=1` | ✅                | Batch [ok1, fail2, ok3] lỗi → chia [ok1, fail2] → [ok1] ✓ + [fail2, ok3] → [fail2] (2 lần) → [ok3] ✓; record sau đó (ok4) vẫn tới → không kẹt shard                                                                                                                                                                  |
| — `StartingPosition=LATEST`                               | ✅                | ESM tạo bằng CloudFormation với LATEST                                                                                                                                                                                                                                                                               |
| — `GetEventSourceMapping`                                 | ⚠️                | Không có `LastProcessingResult`, `StateTransitionReason`                                                                                                                                                                                                                                                             |
| — Trang Lambda hiện có dùng chung được không              | ⚠️ cần sửa nhỏ    | `web/src/services/lambda/hooks/useTriggers.ts` dòng ~91–96: mọi ESM không phải ARN DynamoDB bị coi là **SQS** → ESM Kinesis hiện đang hiện sai thành "SQS", resource = `stream/<name>`. Thêm nguồn `kinesis` vào `TRIGGER_SOURCES` + nhận ARN `arn:aws:kinesis:`; dùng lại `STARTING_POSITIONS`, `STREAM_BATCH_SIZE` |
| DynamoDB `EnableKinesisStreamingDestination`              | ✅                | `DestinationStatus=ACTIVE`; `PutItem`/`UpdateItem` → 2 record trong stream, JSON `{eventName: INSERT/MODIFY, dynamodb:{Keys, NewImage, OldImage, ApproximateCreationDateTime…}, eventSource:"aws:dynamodb", recordFormat:"application/json"}`, partition key = giá trị key. `Describe…`/`Disable…` ✅                |
| DynamoDB `UpdateKinesisStreamingDestination`              | ❌                | `Operation UpdateKinesisStreamingDestination is not supported`                                                                                                                                                                                                                                                       |
| Firehose nguồn Kinesis (`KinesisStreamAsSource` → S3)     | ✅                | Sau ~60 s buffer, S3 có object `YYYY/MM/DD/HH/<fh>-1-…` chứa 2 record. ⚠️ Floci nối các record bằng `\n` (AWS không tự thêm dấu phân cách)                                                                                                                                                                           |
| EventBridge Pipes (Kinesis → SQS)                         | ❌ (hỏng dữ liệu) | Pipe tạo được, SQS nhận 2 message nhưng `kinesis.data=""`, `partitionKey=""`, `sequenceNumber=""`, `approximateArrivalTimestamp=0` — mất dữ liệu                                                                                                                                                                     |
| CloudWatch Logs subscription filter → Kinesis             | ✅                | `PutSubscriptionFilter` destination stream; `PutLogEvents` → 1 record gzip, giải nén ra `{"messageType":"DATA_MESSAGE", logGroup, logStream, subscriptionFilters, logEvents:[…]}` đúng dạng AWS                                                                                                                      |
| CloudFormation `AWS::Kinesis::Stream`                     | ✅ thật           | `CREATE_COMPLETE`, stream thật (`RetentionPeriodHours=48` theo template), `Ref`=tên, `GetAtt Arn` đúng. Kèm `AWS::Lambda::EventSourceMapping` từ stream → ESM thật. Xóa stack xóa cả stream + ESM                                                                                                                    |

### B3. Khác tài liệu / khác AWS

- `SequenceNumber` ngắn (13 chữ số, vd `1795078019344`), AWS dài 56 chữ số — UI đừng giả định độ dài.
- Peek `/_aws/kinesis/*` phụ thuộc region lấy từ `Authorization` (tài liệu chỉ nói "resolved region").
- Peek với `Limit` trả các record mới nhất (không phải từ đầu).
- Pipes nguồn Kinesis làm rỗng các trường record (tài liệu chỉ nhắc giới hạn "first-shard polling").
- Firehose thêm `\n` giữa record.
- `UpdateKinesisStreamingDestination` (DynamoDB) không hỗ trợ.

### B4. Gợi ý thô

- **Làm** (nếu đưa Kinesis vào): Streams list/create (provisioned + on-demand)/delete, chi tiết (shard, retention, encryption, tag), "Put record" + "Peek records" (dùng `/_aws/kinesis/records`, tái dùng `peekAuthorization()` ở `web/src/services/sqs/peek.ts`), và **Lambda trigger từ Kinesis** (tiêu chí 2 — đã chạy thật, kể cả bisect/retry).
- **Làm (rẻ, đi kèm)**: sửa `useTriggers.ts` nhận diện ESM Kinesis (hiện đang hiển thị sai thành SQS — là bug hiện tại nếu ai tạo ESM Kinesis bằng IaC).
- **Để sau**: split/merge/update shard count, EFO consumer, enhanced monitoring (ít dùng khi dev local — đoán); bật DynamoDB → Kinesis destination ở trang DynamoDB (chạy được, nhưng ít dự án dùng — đoán).
- **Không làm**: Pipes Kinesis (Floci làm mất dữ liệu).
- Backend: **không cần sửa** — mọi thứ đi qua `/aws` (kể cả `/_aws/kinesis/records`, như SQS peek).
- Ước lượng: **M** (S nếu chỉ list/put/peek + trigger).
- Đưa lên sớm hơn? **Có thể** — Floci hỗ trợ tốt và Lambda trigger đã xác minh, bỏ được lý do "chưa xác minh" trong roadmap; nhưng vẫn phụ thuộc dự án có dùng Kinesis không (roadmap ghi "ít dự án dùng").

### B5. Chưa kiểm được

- `ReportBatchItemFailures` (`FunctionResponseTypes`), `DestinationConfig.OnFailure`, `ParallelizationFactor`, `TumblingWindowInSeconds`, filter criteria của ESM Kinesis.
- Retention thật sự xóa record sau 24 h (phải chờ).
- `ListStreams` phân trang thật (`NextToken`) — chỉ có 6 stream.
- Kinesis ESM từ consumer EFO (`EventSourceArn` = consumer ARN).

### B6. Dọn dẹp

Stream (6 cái + stream của stack), ESM, function `lc-probe-kinesis-fn` + log group, Firehose, Pipe, bảng DynamoDB, log group `/lc-probe-kinesis/lg` + subscription filter, queue, bucket + object, stack: **đã xóa, kiểm lại còn 0** (ListStreams, ListDeliveryStreams, ListPipes, ListTables, ListFunctions, DescribeLogGroups, ListQueues, ListBuckets lọc prefix `lc-probe-kinesis`).

---

## C. Secrets Manager

### C1. Action / tính năng

| Action / tính năng                                                                                    | Kết quả | Bằng chứng                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateSecret` string / JSON / binary, `Description`, `Tags`                                          | ✅      | ARN có hậu tố 6 ký tự (`-DIH1LN`) như AWS                                                                                                                                                                                                                         |
| `CreateSecret` trùng tên                                                                              | ✅      | `ResourceExistsException`                                                                                                                                                                                                                                         |
| `CreateSecret` `KmsKeyId` không tồn tại                                                               | ✅      | `InvalidParameterException ... can't access the KMS key`                                                                                                                                                                                                          |
| `GetSecretValue` mặc định / `VersionStage=AWSPREVIOUS` / `VersionId` / theo ARN đủ / ARN thiếu hậu tố | ✅      | Đúng version, `VersionStages` đúng; binary trả `SecretBinary` base64                                                                                                                                                                                              |
| `PutSecretValue`                                                                                      | ✅      | version mới AWSCURRENT, cũ → AWSPREVIOUS                                                                                                                                                                                                                          |
| `UpdateSecret` (description + value)                                                                  | ✅      | version mới                                                                                                                                                                                                                                                       |
| `DescribeSecret`                                                                                      | ✅      | `VersionIdsToStages`, `RotationEnabled`, `Tags`, `LastChangedDate`…                                                                                                                                                                                               |
| `ListSecretVersionIds`                                                                                | ✅      |                                                                                                                                                                                                                                                                   |
| `UpdateSecretVersionStage` (label tự đặt)                                                             | ✅      | `GetSecretValue VersionStage=LABELX` OK                                                                                                                                                                                                                           |
| `ListSecrets` filter `name` / `tag-key` / `description`, `MaxResults`+`NextToken`                     | ✅      | Phân trang đúng                                                                                                                                                                                                                                                   |
| `ListSecrets` `IncludePlannedDeletion`                                                                | ✅      | Secret đang chờ xóa ẩn khi không có cờ, hiện với `DeletedDate` khi có                                                                                                                                                                                             |
| `BatchGetSecretValue` (`SecretIdList` / `Filters`)                                                    | ✅      |                                                                                                                                                                                                                                                                   |
| `GetRandomPassword`                                                                                   | ✅      |                                                                                                                                                                                                                                                                   |
| `TagResource` / `UntagResource`                                                                       | ✅      |                                                                                                                                                                                                                                                                   |
| `Put/Get/DeleteResourcePolicy`, `ValidateResourcePolicy`                                              | ✅      | lưu & trả lại; validate chỉ soi wildcard (tài liệu)                                                                                                                                                                                                               |
| `ReplicateSecretToRegions` / `RemoveRegionsFromReplication`                                           | ✅      | `InSync` ngay (AWS báo `InProgress` trước)                                                                                                                                                                                                                        |
| `DeleteSecret` `RecoveryWindowInDays=7`                                                               | ✅      | `DeletionDate` +7 ngày; `GetSecretValue` → `InvalidRequestException ... marked for deletion`                                                                                                                                                                      |
| `RestoreSecret`                                                                                       | ✅      | đọc lại được                                                                                                                                                                                                                                                      |
| `DeleteSecret` `ForceDeleteWithoutRecovery`                                                           | ✅      | biến mất ngay                                                                                                                                                                                                                                                     |
| **`RotateSecret` với Lambda**                                                                         | ✅      | Gọi Lambda thật đủ 4 bước theo thứ tự `createSecret → setSecret → testSecret → finishSecret` (event `{Step, SecretId (ARN), ClientRequestToken, RotationToken}`), giá trị mới thành AWSCURRENT, cũ → AWSPREVIOUS. `RotateSecret` không tham số (xoay lại ngay) ✅ |
| Rotation Lambda không tồn tại                                                                         | ✅      | `AccessDeniedException ... cannot invoke the specified Lambda function` (giống AWS)                                                                                                                                                                               |
| `RotateImmediately=false`                                                                             | ⚠️      | Chỉ gọi bước `testSecret` (đúng ghi chú "known deviation" của tài liệu)                                                                                                                                                                                           |
| **Rotation theo lịch tự chạy**                                                                        | ✅      | `ScheduleExpression=cron(59 8 * * ? *)` (2 phút sau) → lúc 08:59:26 tự xoay (`c0` → `c0-rotated`), `LastRotatedDate` cập nhật, `NextRotationDate` sang ngày sau. Log Floci: "Started background rotation for secret"                                              |
| `CancelRotateSecret`                                                                                  | ✅      | `RotationEnabled=false`                                                                                                                                                                                                                                           |

### C2. Điểm nối

| Điểm nối                                                              | Kết quả           | Bằng chứng                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lambda trong Floci gọi `GetSecretValue`                               | ✅                | Floci inject `AWS_ENDPOINT_URL=http://localhost.floci.io:4566` (+ `AWS_REGION`, key giả) vào container Lambda; `new SecretsManagerClient({})` (SDK có sẵn trong runtime `nodejs22.x`) đọc được secret JSON, không cần cấu hình gì                                                                                                    |
| CloudFormation `{{resolve:secretsmanager:name:SecretString:key}}`     | ✅                | Giá trị resolve thật (`p3`) vào `AWS::SSM::Parameter`                                                                                                                                                                                                                                                                                |
| CloudFormation `AWS::SecretsManager::Secret` + `GenerateSecretString` | ✅ thật           | Tạo secret `{"username":"app","password":"<20 ký tự>"}`; `Ref`=ARN; dynamic ref tới secret cùng stack qua `Fn::Sub` ✅; xóa stack xóa luôn secret (ngay, không recovery window)                                                                                                                                                      |
| SSM `GetParameter /aws/reference/secretsmanager/<id>`                 | ✅                | Cần `WithDecryption=true` (thiếu → `ValidationException`, giống AWS)                                                                                                                                                                                                                                                                 |
| EventBridge khi đổi secret                                            | ⚠️                | **Cần CloudTrail trail đang logging**: không có trail → 0 event; có trail (`CreateTrail`+`StartLogging`) → rule `source=aws.secretsmanager` target SQS nhận `AWS API Call via CloudTrail` cho `PutSecretValue`, `UpdateSecret` (cả chỉ đổi description). **`CreateSecret`, `DeleteSecret` không phát event** (AWS có qua CloudTrail) |
| RDS `ManageMasterUserPassword`                                        | ⚠️ thấy gián tiếp | `ListSecrets` có `rds!cluster-…`, `rds!db-…` do agent RDS tạo → Floci RDS có tạo secret. DocDB thì ❌ (xem A2)                                                                                                                                                                                                                       |
| ECS task `secrets`                                                    | —                 | Agent ECS kiểm. Thấy secret `lc-probe-ecs-sec` của agent đó; tài liệu SSM nói `valueFrom` nhận ARN parameter                                                                                                                                                                                                                         |

### C3. Khác tài liệu / khác AWS

- Sau rotation, version mới mang **cả `AWSPENDING` và `AWSCURRENT`** (AWS thường gỡ `AWSPENDING` khi xong — chưa đối chiếu live). UI hiển thị stage nên lưu ý.
- `UpdateSecret`/`PutSecretValue` lần thứ 3: version cũ không còn label bị bỏ khỏi `VersionIdsToStages` (AWS giữ version "deprecated" một thời gian).
- Replication `InSync` ngay.
- Giá trị lưu dạng rõ (tài liệu).
- Event EventBridge chỉ có `PutSecretValue`/`UpdateSecret`, và phải có CloudTrail trail.

### C4. Gợi ý thô

- **Làm**: list (filter, phân trang), tạo (string / key-value JSON; binary để sau), xem giá trị (AWSCURRENT, chọn version/stage), sửa giá trị (`PutSecretValue`), sửa mô tả, tag, xóa (recovery window / force) + restore. Lý do: dev hay seed/sửa secret khi chạy local, và là điểm nối chính của Lambda/CloudFormation (tiêu chí 1+2).
- **Làm (tiêu chí 2)**: cấu hình rotation (chọn Lambda, lịch) + nút "Rotate now" + hiển thị `LastRotatedDate`/`NextRotationDate` — Floci gọi Lambda thật 4 bước và lịch tự chạy, hữu ích để test rotation function local (đoán: ít dự án tự viết rotation function → có thể để đợt sau).
- **Để sau**: resource policy, replication, `BatchGetSecretValue`, binary secret, `GetRandomPassword` (đoán ít dùng).
- Backend: **không cần sửa** — JSON 1.1 qua `/aws`.
- Ước lượng: **S** (CRUD + xem giá trị) / **M** nếu kèm rotation.
- Đưa lên sớm hơn? **Có** — rẻ, Floci hỗ trợ gần đủ, và là điểm nối của Lambda (đọc secret), CloudFormation (`resolve:secretsmanager`), RDS (secret `rds!…`). Nên gộp chung một đợt với SSM.

### C5. Chưa kiểm được

- Rotation cho secret `rds!…` (secret của RDS do agent khác sở hữu, không đụng).
- `AWS::SecretsManager::RotationSchedule`, `AWS::SecretsManager::ResourcePolicy` trong CloudFormation.
- IAM enforcement (Floci đang tắt).
- `StopReplicationToReplica`.

### C6. Dọn dẹp

Secret `lc-probe-secrets-*` (a, json, bin, rotme, sched, cron, ev2, cfn): `ForceDeleteWithoutRecovery` / xóa theo stack → `ListSecrets IncludePlannedDeletion` còn 0 ở `ap-southeast-1` và `us-east-1` (replica). Function `lc-probe-secrets-rot` + log group, rule `lc-probe-secrets-rule`, queue `lc-probe-secrets-evq`, trail `lc-probe-secrets-trail` + bucket, stack `lc-probe-secrets-stack`: đã xóa, kiểm còn 0.

---

## D. SSM Parameter Store

### D1. Action / tính năng

| Action / tính năng                                                                                     | Kết quả           | Bằng chứng                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `PutParameter` String (+ `Description`, `Tags`) / StringList / SecureString                            | ✅                | `Version=1`                                                                                             |
| Tier `Advanced` / `Intelligent-Tiering`                                                                | ✅                | `DescribeParameters` hiện `Tier`                                                                        |
| Trùng tên không `Overwrite`                                                                            | ✅                | `ParameterAlreadyExists`                                                                                |
| `Overwrite=true`                                                                                       | ✅                | `Version=2`                                                                                             |
| `Overwrite` + `Tags`                                                                                   | ✅ (giống AWS)    | `ValidationException tags and overwrite can't be used together`                                         |
| Đổi type khi overwrite (StringList → String)                                                           | ✅                | 200                                                                                                     |
| `GetParameter` String                                                                                  | ✅                | có `ARN`, `DataType=text`                                                                               |
| `GetParameter` SecureString **không** `WithDecryption`                                                 | ⚠️ (bẫy xác nhận) | Trả **plaintext** `s3cret` (AWS trả ciphertext). Tài liệu mới nói trả ciphertext → 2.4.0 chưa có        |
| `GetParameter` SecureString `WithDecryption=true`                                                      | ✅                | plaintext                                                                                               |
| `GetParameter name:version` / `name:label`                                                             | ✅                | có `Selector`                                                                                           |
| `GetParameters` (có tên không tồn tại)                                                                 | ✅                | `InvalidParameters`                                                                                     |
| `GetParametersByPath` không recursive / recursive / `MaxResults`+`NextToken` / `ParameterFilters Type` | ✅                | non-recursive chỉ 1 cấp; phân trang 2+2 đúng                                                            |
| `DescribeParameters` filter `Name BeginsWith`, `Path Recursive`, `tag:k`, `Filters` kiểu cũ            | ✅                | SecureString có `KeyId=alias/aws/ssm`                                                                   |
| `GetParameterHistory`                                                                                  | ✅                | đủ version + value                                                                                      |
| `LabelParameterVersion` / `UnlabelParameterVersion`                                                    | ✅                |                                                                                                         |
| `Add/List/RemoveTagsFromResource` (`ResourceType=Parameter`)                                           | ✅                |                                                                                                         |
| `DeleteParameter` / `DeleteParameters`                                                                 | ✅                | `DeletedParameters` đủ 10                                                                               |
| `GetParameter` không tồn tại                                                                           | ✅                | `ParameterNotFound`                                                                                     |
| Parameter policy `Expiration` (Advanced)                                                               | ⚠️ chỉ lưu        | `DescribeParameters` hiện `Policies[].PolicyStatus=Pending`; **30 s sau mốc hết hạn parameter vẫn còn** |
| Policy trên tier Standard                                                                              | ⚠️ khác AWS       | Chấp nhận (AWS từ chối: policy chỉ cho Advanced)                                                        |
| Giá trị 5 KB trên Standard                                                                             | ⚠️ khác AWS       | Chấp nhận (AWS giới hạn 4 KB)                                                                           |
| Public parameter `/aws/service/ami-amazon-linux-latest/…`                                              | ✅                | `GetParameter` + `GetParametersByPath` trả AMI id giả từ catalog EC2                                    |
| Public `/aws/service/global-infrastructure/regions`                                                    | ❌                | rỗng                                                                                                    |

### D2. Điểm nối

| Điểm nối                                                           | Kết quả      | Bằng chứng                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lambda đọc parameter                                               | ✅           | Function `nodejs22.x` dùng `@aws-sdk/client-ssm` có sẵn (endpoint inject qua `AWS_ENDPOINT_URL`): `GetParameter WithDecryption`, `GetParametersByPath recursive`, `/aws/reference/secretsmanager/…` đều đúng      |
| CloudFormation `{{resolve:ssm:/path}}`                             | ✅           | resolve thật (`plainval`)                                                                                                                                                                                         |
| CloudFormation parameter type `AWS::SSM::Parameter::Value<String>` | ✅           | `Ref` ra giá trị parameter (`plainval`)                                                                                                                                                                           |
| CloudFormation `{{resolve:ssm-secure:…}}`                          | ⚠️ giống AWS | Chỉ cho `MasterUserPassword` của `AWS::RDS::DBInstance/DBCluster`; dùng ở `AWS::SSM::Parameter` → `CREATE_FAILED` + rollback                                                                                      |
| CloudFormation `AWS::SSM::Parameter`                               | ✅ thật      | Tạo parameter thật, xóa stack xóa parameter                                                                                                                                                                       |
| CDK bootstrap `/cdk-bootstrap/<qualifier>/version`                 | ⚠️ suy luận  | Chưa bootstrap nên `ParameterNotFound`. Template bootstrap tạo nó bằng `AWS::SSM::Parameter` — loại resource này chạy thật (trên), nên nhiều khả năng ổn; chưa chạy `cdk bootstrap` thật                          |
| EventBridge khi đổi parameter                                      | ✅           | Không cần trail. Rule `source=aws.ssm, detail-type=Parameter Store Change` → SQS nhận `Create`, `Update`, `LabelParameterVersion` (có `label`, `fromVersion`, `toVersion`), `Delete`; `resources` = ARN parameter |
| ECS `secrets` từ SSM                                               | —            | Agent ECS kiểm; tài liệu nói `valueFrom` nhận ARN parameter                                                                                                                                                       |

### D3. Khác tài liệu / khác AWS

- **SecureString trả plaintext khi thiếu `WithDecryption`** (bẫy roadmap — xác nhận; tài liệu mới nói đã sửa → bản sau 2.4.0).
- Expiration policy không tự xóa parameter (ít nhất trong 30 s sau mốc).
- Không kiểm giới hạn: policy trên Standard, value > 4 KB trên Standard đều được nhận.
- `/aws/service/global-infrastructure/*` rỗng; chỉ có AMI/EKS/ECS/Ubuntu (tài liệu).
- `GetParameterHistory` không có `ARN`, `Labels` rỗng không hiện (không ảnh hưởng nhiều).

### D4. Gợi ý thô

- **Làm**: list parameter (theo path/tree, filter tên, phân trang), tạo/sửa (String, StringList, SecureString, description, tier), xem giá trị + lịch sử version, xóa (cả xóa nhiều), tag. Lý do: dev hay seed config/feature flag cho Lambda/app khi chạy local, và là điểm nối của Lambda, CloudFormation (`resolve:ssm`, `AWS::SSM::Parameter::Value`), CDK, EventBridge (tiêu chí 1+2).
- UI phải **tự che SecureString** (nút "Show/Decrypt") vì Floci trả rõ — không dựa vào phản hồi API.
- **Để sau**: label version, parameter policy (Floci chỉ lưu, không chạy), public parameter, advanced tier/resource policy (đoán ít dùng).
- **Không làm**: Run Command / Documents / Associations (ngoài phạm vi Parameter Store).
- Backend: **không cần sửa**.
- Ước lượng: **S–M**.
- Đưa lên sớm hơn? **Có** — đi cùng Secrets Manager thành một đợt (đều JSON 1.1, đều là "config cho Lambda/app"), chi phí thấp.

### D5. Chưa kiểm được

- Expiration policy có chạy sau thời gian dài hơn không (chỉ chờ 30 s).
- `ExpirationNotification` / `NoChangeNotification` policy → EventBridge.
- Chạy `cdk bootstrap` thật (không cài CDK).
- `Put/Get/DeleteResourcePolicy` cho parameter (tài liệu có).
- Giá trị còn sau restart Floci (cấm restart).

### D6. Dọn dẹp

Parameter `/lc-probe-ssm/**` (10 cái + 4 cái do stack tạo + `/lc-probe-ssm/ev/a`): đã xóa; `DescribeParameters Path=/lc-probe-ssm Recursive` → rỗng. Function `lc-probe-ssm-fn` + log group, rule `lc-probe-ssm-rule`, queue `lc-probe-ssm-evq`: đã xóa, kiểm còn 0.

---

## E. Tổng hợp nhanh cho roadmap

| Service             | Floci 2.4.0                                                                                        | Cần backend                 | Công                  | Gợi ý đợt                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| Secrets Manager     | Gần đủ; rotation Lambda + lịch chạy thật                                                           | Không                       | S (M nếu có rotation) | Đưa lên sớm, gộp với SSM                                                            |
| SSM Parameter Store | Đủ cho dev; bẫy SecureString trả rõ                                                                | Không                       | S–M                   | Đưa lên sớm, gộp với Secrets                                                        |
| Kinesis             | Tốt; Lambda ESM (batch, bisect, retry) chạy thật; Pipes hỏng                                       | Không                       | M                     | Có thể sớm hơn nếu có dự án dùng; sửa luôn bug nhận diện ESM Kinesis ở trang Lambda |
| DocumentDB          | Mongo thật nhưng chỉ tới được trong compose network, không TLS, CFN stub, nhiều action Unsupported | Có (cầu nối Mongo + driver) | L                     | Giữ "Để sau"                                                                        |
