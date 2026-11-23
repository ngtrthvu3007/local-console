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
