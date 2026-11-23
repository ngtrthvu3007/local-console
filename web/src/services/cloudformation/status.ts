import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import {
  FAILED_STATUS_SUFFIX,
  IN_PROGRESS_STATUS_SUFFIX,
  REVIEW_IN_PROGRESS_STATUS,
  TLS_ERROR_MARKERS,
} from "./constants.ts";

const ROLLBACK_COMPLETE_SUFFIX = "ROLLBACK_COMPLETE";
const COMPLETE_SUFFIX = "_COMPLETE";
const DELETE_SKIPPED_STATUS = "DELETE_SKIPPED";

const isInProgress = (status = "") => status.endsWith(IN_PROGRESS_STATUS_SUFFIX);
// Đang chạy thật: REVIEW_IN_PROGRESS chờ người execute change set nên không cần poll
export const isRunning = (status = "") =>
  isInProgress(status) && status !== REVIEW_IN_PROGRESS_STATUS;
export const isFailed = (status = "") => status.endsWith(FAILED_STATUS_SUFFIX);

export const needsTls = (reason = "") =>
  TLS_ERROR_MARKERS.every((marker) => reason.includes(marker));

// Rollback xong vẫn là lỗi
export function statusGroup(status = ""): StatusIndicatorProps.Type {
  if (isInProgress(status)) return "in-progress";
  if (isFailed(status) || status.endsWith(ROLLBACK_COMPLETE_SUFFIX)) return "error";
  if (status.endsWith(COMPLETE_SUFFIX) || status === DELETE_SKIPPED_STATUS) return "success";
  return "info";
}
