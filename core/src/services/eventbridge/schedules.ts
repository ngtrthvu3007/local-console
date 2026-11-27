import type {
  GetScheduleCommandOutput,
  ScheduleSummary,
  Target,
  UpdateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import { DEFAULT_ROLE_ARN } from "#services/lambda/constants.ts";
import { SCHEDULE_STATES } from "./constants.ts";
import {
  ADDABLE_TARGET_KINDS,
  ecsParameters,
  targetKindOfArn,
  type AddableTargetKind,
  type EcsTarget,
} from "./targets.ts";

// Một dòng của ListSchedules: không có biểu thức, chỉ có đích (spec 7 #11)
export interface ScheduleRow {
  name: string;
  group: string;
  arn: string;
  enabled: boolean;
  targetArn: string;
}

export const toScheduleRow = (summary: ScheduleSummary): ScheduleRow => ({
  name: summary.Name ?? "",
  group: summary.GroupName ?? "",
  arn: summary.Arn ?? "",
  enabled: summary.State === SCHEDULE_STATES.enabled,
  targetArn: summary.Target?.Arn ?? "",
});

// Kết quả GetSchedule giữ nguyên để sửa lại không làm mất trường form không có
export type Schedule = GetScheduleCommandOutput;

// UpdateSchedule ghi đè cả schedule: request = kết quả GetSchedule + phần thay đổi
export function toUpdateInput(
  current: Schedule,
  changes: Partial<UpdateScheduleCommandInput> = {},
): UpdateScheduleCommandInput {
  return {
    Name: current.Name,
    GroupName: current.GroupName,
    ScheduleExpression: current.ScheduleExpression,
    ScheduleExpressionTimezone: current.ScheduleExpressionTimezone,
    StartDate: current.StartDate,
    EndDate: current.EndDate,
    Description: current.Description,
    State: current.State,
    Target: current.Target,
    FlexibleTimeWindow: current.FlexibleTimeWindow,
    KmsKeyArn: current.KmsKeyArn,
    ActionAfterCompletion: current.ActionAfterCompletion,
    ...changes,
  };
}

// Loại đích form biểu diễn được; Kinesis, universal target… thì khóa phần Target khi sửa
export function editableTargetKind(target?: Target): AddableTargetKind | undefined {
  const kind = targetKindOfArn(target?.Arn ?? "");
  return ADDABLE_TARGET_KINDS.find((allowed) => allowed === kind);
}

// Form chỉ sửa task definition + mạng: TaskCount, PlatformVersion, launch type, AssignPublicIp…
// của target cũ (CDK tạo) giữ nguyên; mặc định của form chỉ dùng khi target chưa có
function mergeEcsParameters(ecs: EcsTarget, existing?: Target["EcsParameters"]) {
  const fromForm = ecsParameters(ecs);
  return {
    ...fromForm,
    ...existing,
    TaskDefinitionArn: fromForm.TaskDefinitionArn,
    NetworkConfiguration: {
      awsvpcConfiguration: {
        ...existing?.NetworkConfiguration?.awsvpcConfiguration,
        ...fromForm.NetworkConfiguration.awsvpcConfiguration,
      },
    },
  };
}

// Target mới từ form; tham số lạ của target cũ (retry, DLQ, RoleArn thật) giữ nguyên khi sửa
export function buildTarget(
  input: {
    arn: string;
    input: string;
    messageGroupId?: string;
    eventBus?: { source: string; detailType: string };
    ecs?: EcsTarget;
  },
  existing?: Target,
): Target {
  return {
    ...existing,
    Arn: input.arn,
    RoleArn: existing?.RoleArn ?? DEFAULT_ROLE_ARN,
    Input: input.input || undefined,
    SqsParameters: input.messageGroupId ? { MessageGroupId: input.messageGroupId } : undefined,
    EventBridgeParameters: input.eventBus
      ? { Source: input.eventBus.source, DetailType: input.eventBus.detailType }
      : undefined,
    EcsParameters: input.ecs ? mergeEcsParameters(input.ecs, existing?.EcsParameters) : undefined,
  };
}
