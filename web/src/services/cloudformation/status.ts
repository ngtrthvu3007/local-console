import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import {
  CDK_BOOTSTRAP_OUTPUT,
  CDK_EDIT_LOCK_REASON,
  CDK_METADATA_TYPE,
  FAILED_STATUS_SUFFIX,
  IN_PROGRESS_STATUS_SUFFIX,
  LOADING_EDIT_LOCK_REASON,
  NO_UPDATES_MESSAGE,
  REVIEW_IN_PROGRESS_STATUS,
  RUNNING_EDIT_LOCK_REASON,
  TLS_ERROR_MARKERS,
} from "./constants.ts";

const ROLLBACK_COMPLETE_SUFFIX = "ROLLBACK_COMPLETE";
const COMPLETE_SUFFIX = "_COMPLETE";
const DELETE_SKIPPED_STATUS = "DELETE_SKIPPED";

export const isInProgress = (status = "") => status.endsWith(IN_PROGRESS_STATUS_SUFFIX);
// Đang chạy thật: REVIEW_IN_PROGRESS chờ người execute change set nên không cần poll
export const isRunning = (status = "") =>
  isInProgress(status) && status !== REVIEW_IN_PROGRESS_STATUS;
export const isFailed = (status = "") => status.endsWith(FAILED_STATUS_SUFFIX);

export const needsTls = (reason = "") =>
  TLS_ERROR_MARKERS.every((marker) => reason.includes(marker));

// CDK luôn thêm resource này: sửa template trên console sẽ bị cdk deploy ghi đè
export const isCdkStack = (
  resources: readonly { ResourceType?: string }[],
  outputs: readonly { OutputKey?: string }[] = [],
) =>
  resources.some(({ ResourceType }) => ResourceType === CDK_METADATA_TYPE) ||
  outputs.some(({ OutputKey }) => OutputKey === CDK_BOOTSTRAP_OUTPUT);

// Lý do không cho sửa template; undefined = sửa được. Stack hay resources chưa tải thì chưa biết có phải CDK không
export function editLockReason(
  stack: { StackStatus?: string; Outputs?: readonly { OutputKey?: string }[] } | undefined,
  resources: readonly { ResourceType?: string }[] | undefined,
) {
  if (isInProgress(stack?.StackStatus)) return RUNNING_EDIT_LOCK_REASON;
  if (!stack || !resources) return LOADING_EDIT_LOCK_REASON;
  if (isCdkStack(resources, stack.Outputs)) return CDK_EDIT_LOCK_REASON;
  return undefined;
}

export const isNoUpdatesError = (error: unknown) =>
  error instanceof Error && error.message.includes(NO_UPDATES_MESSAGE);

// Rollback xong vẫn là lỗi
export function statusGroup(status = ""): StatusIndicatorProps.Type {
  if (isInProgress(status)) return "in-progress";
  if (isFailed(status) || status.endsWith(ROLLBACK_COMPLETE_SUFFIX)) return "error";
  if (status.endsWith(COMPLETE_SUFFIX) || status === DELETE_SKIPPED_STATUS) return "success";
  return "info";
}
