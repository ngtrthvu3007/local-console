export const DEFAULT_EXECUTION_INPUT = "{}";
// Luật của AWS: tên execution 1–80 ký tự
export const EXECUTION_NAME_MAX_LENGTH = 80;
export const RUNNING_STATUS = "RUNNING";

export const STEP_STATUSES = [
  "succeeded",
  "caught",
  "running",
  "failed",
  "aborted",
  "timedOut",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

// Bước chưa kết thúc khi execution đã dừng thì theo status của execution
export const STEP_STATUS_OF_EXECUTION: Record<string, StepStatus> = {
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  TIMED_OUT: "timedOut",
  ABORTED: "aborted",
};
