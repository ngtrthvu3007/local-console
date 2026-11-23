// Tải lại khi còn stack *_IN_PROGRESS
export const STACK_POLL_INTERVAL_MS = 2000;
// Index của StackLink dùng lại trong khoảng này
export const RESOURCE_INDEX_STALE_MS = 30_000;
// Số lần hỏi tối đa khi chờ xóa stack
export const DELETE_WAIT_MAX_POLLS = 30;

// Lý do Floci ghi cho resource bị stub (chỉ có ở events)
export const STUB_REASON_MARKER = "was stubbed and nothing was created";

// CDK custom resource Node cần Floci bật TLS (development.md › Traps)
export const TLS_ERROR_MARKERS = ["ECONNREFUSED", ":443"] as const;
export const TLS_HINT =
  "Node.js custom resources (CDK autoDeleteObjects, BucketDeployment…) need Floci started with FLOCI_TLS_ENABLED=true.";

export const NESTED_STACK_TYPE = "AWS::CloudFormation::Stack";
export const DELETE_COMPLETE_STATUS = "DELETE_COMPLETE";
export const DELETE_FAILED_STATUS = "DELETE_FAILED";
export const REVIEW_IN_PROGRESS_STATUS = "REVIEW_IN_PROGRESS";
export const FAILED_STATUS_SUFFIX = "_FAILED";
export const IN_PROGRESS_STATUS_SUFFIX = "_IN_PROGRESS";
export const CDK_METADATA_TYPE = "AWS::CDK::Metadata";

// Luật tên stack của AWS
export const STACK_NAME_PATTERN = /^[A-Za-z][-A-Za-z0-9]*$/;
export const STACK_NAME_MAX_LENGTH = 128;

// Template mẫu khi tạo stack: đủ nhỏ để người mới sửa từ đó
export const STARTER_TEMPLATE = `Resources:
  Queue:
    Type: AWS::SQS::Queue
Outputs:
  QueueUrl:
    Value: !Ref Queue
`;

// Floci trả lỗi này khi update không đổi gì (spec 7 #1): không phải lỗi thật
export const NO_UPDATES_MESSAGE = "No updates are to be performed";
export const CDK_EDIT_LOCK_REASON =
  "Deployed by CDK: edit it in your CDK app. cdk deploy would overwrite changes made here.";
export const RUNNING_EDIT_LOCK_REASON = "Wait until the stack finishes.";
export const LOADING_EDIT_LOCK_REASON = "Loading the stack's resources…";
export const EDIT_TEMPLATE_NOTE =
  "Deploying this stack again from a file replaces changes made here.";
export const NO_CHANGES_NOTICE = "No changes to deploy.";
export const TEMPLATE_EDITOR_HEIGHT_PX = 480;
