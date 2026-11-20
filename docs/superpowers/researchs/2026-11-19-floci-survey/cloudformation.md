# CloudFormation — ghi chú khảo sát Floci 2.4.0 (2026-11-19)

Nguồn: 3 agent (khảo sát đầu, độ ảnh hưởng, nghiên cứu sâu) + main. Script/fixture: `scratchpad/cfnres/` (refs.py, persist.py, sim.py, cdk/*.json, types-out.txt), `scratchpad/cfnimp/`.

## Đã chốt với user
- Phạm vi Làm: danh sách stack; chi tiết: Events (mới nhất trên, lọc FAILED, nổi lý do, tự làm mới khi *_IN_PROGRESS), Resources (badge "Stubbed by Floci", link sang service, **cột References**), Outputs, Parameters, Template (**CodeSnippet**, Original/Processed); cảnh báo stub; nested stack link; xóa stack; **StackLink**.
- Để sau: change set, tạo/update từ UI, exports, termination protection, policy, tags. Không làm: drift, type registry, StackSets, **canvas**.
- **StackLink tra bằng index** (DescribeStacks + ListStackResources từng stack, bỏ DELETE_COMPLETE), query dùng chung, SDK nạp lười (`await import`). Đặt ở `web/src/services/cloudformation/components/StackLink.tsx`.
- StackLink trên: S3 BucketDetail, Lambda FunctionDetail, DynamoDB TableDetail, SQS QueueDetail (dùng queue.url), ElastiCache ClusterDetail (chỉ cache-cluster). KHÔNG đặt ở MQ (Broker luôn stub). Header description đang là chuỗi nối DETAIL_SEPARATOR → đổi sang ReactNode.

## Floci 2.4.0 — API
- CreateStack đồng bộ (chặn tới khi xong). Change set Execute bất đồng bộ → thấy *_IN_PROGRESS (luồng CDK).
- Không phân trang ở mọi API (117 stack, 303 events, 150 resources một trang). Vẫn viết vòng NextToken.
- ListStacks: chỉ StackId/Name/Status/CreationTime (+DeletionTime); giữ DELETE_COMPLETE làm lịch sử. StackStatusFilter chạy. DescribeStacks (không tên) trả tất cả, có reason + LastUpdatedTime, KHÔNG Description (lấy từ GetTemplateSummary). → Trang danh sách dùng DescribeStacks.
- DescribeStacks sau xóa: giữ 30 s (`FLOCI_SERVICES_CLOUDFORMATION_DELETED_STACK_RETENTION_SECONDS`).
- Thiếu: Output.Description, Capabilities, ParentId/RootId, event ClientRequestToken/DetailedStatus, Parameter ResolvedValue (SSM param chỉ có đường dẫn).
- Events: mới nhất trước; timestamp nano giây, nhiều event cùng ms → giữ thứ tự API, không sort lại. Event đầu mọi stack: REVIEW_IN_PROGRESS User Initiated. Reason có thể nhiều dòng (`\n`).
- Stub: reason "Resource type X is not supported by Floci. It was stubbed and nothing was created for it." chỉ có trong DescribeStackEvents / DescribeStackResource (số ít). Physical id `<Logical>-<8hex>` ĐỔI sau mỗi update. → badge dựa vào reason từ DescribeStackEvents, không dựa danh sách type.
- Type stub đáng chú ý (2.4.0): AmazonMQ::Broker, ElastiCache::ReplicationGroup, Logs::SubscriptionFilter, SQS::QueueInlinePolicy, SNS::TopicInlinePolicy, IAM::Group, Events::Connection, StepFunctions::Activity, SecretsManager::RotationSchedule, Cognito::IdentityPool, Cognito::UserPoolIdentityProvider, SES::Template, SES::ConfigurationSet, EC2::KeyPair, EFS::*, Glue, Athena, Lightsail, WaitCondition. Đầy đủ: `cfnres/types-out.txt`.
- Trạng thái thấy thật: REVIEW_IN_PROGRESS, CREATE_IN_PROGRESS/COMPLETE/FAILED (stack con lỗi, không rollback), ROLLBACK_IN_PROGRESS/COMPLETE, UPDATE_IN_PROGRESS/COMPLETE, UPDATE_ROLLBACK_IN_PROGRESS/COMPLETE, DELETE_IN_PROGRESS/FAILED/COMPLETE; resource DELETE_SKIPPED. UI map đủ enum AWS.
- Lệch AWS: OnFailure bị bỏ qua (luôn ROLLBACK_COMPLETE); DisableRollback bỏ qua; DeleteStack RetainResources bỏ qua; UpdateStack trên CREATE_FAILED được nhận; Ref tới param không khai báo → chuỗi literal; resource CREATE_FAILED không có PhysicalResourceId; KMS key không schedule xóa khi xóa stack.
- REVIEW_IN_PROGRESS: ListStacks có, DescribeStacks không Outputs/Params, events 1 dòng, resources rỗng, GetTemplate `{}` → empty state riêng "Waiting for change set execution".
- Exports: Export/ImportValue chạy; ListExports chạy; ListImports UnknownAction; **xóa stack có export đang bị import vẫn thành công** → UI tự cảnh báo khi xóa.
- Change set: Details rỗng; drift/type registry UnknownAction.
- Persistence: `/app/data/cloudformation-stacks.json` lưu stack + events + resources + template + change set (đọc tĩnh). CHƯA restart thật: chạy `cfnres/persist.py before` → `docker compose restart floci` → `after` → `cleanup`.

## Template / References
- GetTemplate YAML: cả Original và Processed trả YAML nguyên văn. JSON nguyên văn. SAM transform: Processed = JSON đã mở rộng (logical id khớp resources).
- Repo không có thư viện YAML → dùng `TemplateStage=Processed`, JSON.parse; không phải `{` → cột References "—" + ghi chú không hỗ trợ YAML (chờ user quyết thêm package `yaml`).
- Tham chiếu: Ref; Fn::GetAtt mảng và chuỗi "X.Attr" (tách ở dấu chấm ĐẦU); Fn::Sub `${X}`/`${X.Attr}`, bỏ `${!…}`, dạng mảng bỏ biến cục bộ; DependsOn chuỗi/mảng; Fn::ImportValue (cross-stack, hiện tên export); đệ quy Join/If (cả 2 nhánh)/Select; bỏ `AWS::*`, bỏ tên trong Parameters; tên lạ → "unknown". Chỉ duyệt Properties + DependsOn. Dùng cho Outputs để dựng link (Value tham chiếu resource X → physical id của X). Thuật toán mẫu: `cfnres/refs.py`.

## Liên kết resource → trang service (physical id thật)
- S3 Bucket: tên (BucketPolicy cùng tên → lọc type). Lambda Function: tên. Lambda::Url: ARN function. EventSourceMapping: UUID (GetEventSourceMapping → FunctionArn → tab triggers). DynamoDB Table: tên. SQS Queue: URL `http://localhost:4566/000000000000/<name>`. ElastiCache CacheCluster: id. LogGroup: tên (`/aws/lambda/<fn>` → tab monitor). SNS Topic: ARN; Subscription: ARN topic + `:<uuid>`. SES EmailIdentity: địa chỉ. Cognito UserPool: pool id; UserPoolClient: client id (link khi stack có đúng 1 pool). EventBus: tên. Events Rule: chỉ tên (kể cả bus riêng → dò ListEventBuses + ListRules NamePrefix). Scheduler Schedule: chỉ tên (ListSchedules NamePrefix trả GroupName). ApiGateway RestApi / V2 Api: id 10 ký tự. StepFunctions StateMachine: ARN. Nested stack: physical id = ARN stack con. IAM/Permission/QueuePolicy/TopicPolicy: không có trang.
- DescribeStackResources?PhysicalResourceId: không thuộc stack → HTTP 400 (console.error → E2E fail) → lý do dùng index.

## Bẫy cho README › Traps
- Xóa tay resource do stack tạo: stack vẫn CREATE_COMPLETE; tạo tay lại cùng tên rồi DeleteStack → resource tạo tay bị xóa luôn.
- Bucket có object → DeleteStack DELETE_FAILED.
- Stack CREATE_COMPLETE ở local chưa chắc deploy được trên AWS (Ref sai thành literal, OnFailure/DisableRollback bỏ qua, stub).

## AWS Console để bám
- List: Stack name (badge NESTED), Status, Created time, Description; lọc Active/Complete/Failed/Deleted/In progress; "View nested".
- Detail tabs: Stack info, Events (Timestamp, Logical ID, Status, Status reason; tìm kiếm), Resources (Logical ID, Physical ID link, Type, Status, Status reason), Outputs (Key, Value, Description, Export name), Parameters (Key, Value, Resolved value), Template (Copy, View processed), Change sets.
- Nested: nguyên nhân gốc nằm ở events stack con → link sang stack con.

## Việc user cần làm
- `cdk deploy` thật (lệnh trong báo cáo agent): bootstrap, deploy 2 lần (lần 2 "no changes"), --hotswap (không có event), destroy; xem REVIEW_IN_PROGRESS, tự làm mới, TemplateURL CLI gửi.
- Quyết định package `yaml`.
- KMS key sót (PendingDeletion 7 ngày): `de2a63c1-…` (khảo sát đầu), `8d655a97-28b6-41c5-82f3-b969f98822a6`.

## cdk deploy thật (user chạy, 2026-11-19)
- Floci chính (không TLS): `cdk bootstrap` ✅ (CDKToolkit 11 resource, BootstrapVersion 34). Deploy app có `autoDeleteObjects` ❌: handler Node gửi kết quả bằng https.request cổng 443 (bỏ qua ResponseURL `http://localhost.floci.io/cfn-response/…`) → ECONNREFUSED 172.28.0.2:443 → rollback. Stack `LcCdkProbe` ROLLBACK_COMPLETE + CDKToolkit còn trên Floci chính.
- Container Floci riêng `FLOCI_TLS_ENABLED=true` (đã xóa): custom resource Node 443 ✅; cdk bootstrap/deploy/no-changes/destroy (làm rỗng bucket) ✅; stub Glue nhận đúng. Tác dụng phụ: URL trả về thành `https://localhost:4566/...` (QueueUrl, physical ID queue). HTTP 4566 vẫn chạy.
- App mẫu: `scratchpad/cdk-probe/`.
