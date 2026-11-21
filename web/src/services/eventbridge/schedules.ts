import {
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  type GetScheduleCommandOutput,
  type ScheduleSummary,
  type SchedulerClient,
  type Target,
  type UpdateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import { allPages } from "@shared/aws.ts";
import { DEFAULT_ROLE_ARN } from "../lambda/constants.ts";
import { SCHEDULE_STATES } from "./constants.ts";
import { SCHEDULE_TARGET_KINDS, targetKindOfArn, type ScheduleTargetKind } from "./targets.ts";

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

// group rỗng = mọi group
export const listSchedules = (client: SchedulerClient, group?: string) =>
  allPages(async (nextToken) => {
    const page = await client.send(
      new ListSchedulesCommand({ GroupName: group, NextToken: nextToken }),
    );
    return { items: (page.Schedules ?? []).map(toScheduleRow), nextToken: page.NextToken };
  });

export const listScheduleGroups = (client: SchedulerClient) =>
  allPages(async (nextToken) => {
    const page = await client.send(new ListScheduleGroupsCommand({ NextToken: nextToken }));
    return {
      items: (page.ScheduleGroups ?? []).map((group) => group.Name ?? ""),
      nextToken: page.NextToken,
    };
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

// Loại đích form biểu diễn được; ECS, Kinesis, universal target… thì khóa phần Target khi sửa
export function editableTargetKind(target?: Target): ScheduleTargetKind | undefined {
  const kind = targetKindOfArn(target?.Arn ?? "");
  return SCHEDULE_TARGET_KINDS.find((allowed) => allowed === kind);
}

// Target mới từ form; tham số lạ của target cũ (retry, DLQ, RoleArn thật) giữ nguyên khi sửa
export function buildTarget(
  input: {
    arn: string;
    input: string;
    messageGroupId?: string;
    eventBus?: { source: string; detailType: string };
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
  };
}
