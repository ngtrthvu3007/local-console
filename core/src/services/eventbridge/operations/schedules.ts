import {
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
  type SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { allPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { SCHEDULE_STATES } from "#services/eventbridge/constants.ts";
import { toScheduleRow, toUpdateInput, type ScheduleRow } from "#services/eventbridge/schedules.ts";

export type SaveScheduleInput = Omit<CreateScheduleCommandInput, "ClientToken">;

// group rỗng = mọi group
export const listSchedules = (scheduler: SchedulerClient, group?: string) =>
  allPages(async (nextToken) => {
    const page = await scheduler.send(
      new ListSchedulesCommand({ GroupName: group, NextToken: nextToken }),
    );
    return { items: (page.Schedules ?? []).map(toScheduleRow), nextToken: page.NextToken };
  });

export const listScheduleGroups = (scheduler: SchedulerClient) =>
  allPages(async (nextToken) => {
    const page = await scheduler.send(new ListScheduleGroupsCommand({ NextToken: nextToken }));
    return {
      items: (page.ScheduleGroups ?? []).map((group) => group.Name ?? ""),
      nextToken: page.NextToken,
    };
  });

export const getSchedule = (scheduler: SchedulerClient, group: string, name: string) =>
  scheduler.send(new GetScheduleCommand({ GroupName: group, Name: name }));

export const createScheduleGroup = (scheduler: SchedulerClient, name: string) =>
  scheduler.send(new CreateScheduleGroupCommand({ Name: name }));

// Xóa group xóa luôn schedule trong đó (Floci giống AWS)
export const deleteScheduleGroup = (scheduler: SchedulerClient, name: string) =>
  scheduler.send(new DeleteScheduleGroupCommand({ Name: name }));

// Sửa: UpdateSchedule ghi đè cả schedule nên input đã gộp với dữ liệu hiện có ở form
export const saveSchedule = (
  scheduler: SchedulerClient,
  input: SaveScheduleInput,
  editing: boolean,
) => scheduler.send(editing ? new UpdateScheduleCommand(input) : new CreateScheduleCommand(input));

// API không có lệnh bật / tắt: đọc lại schedule rồi ghi với State mới
export const setSchedulesEnabled = (
  scheduler: SchedulerClient,
  rows: readonly ScheduleRow[],
  enabled: boolean,
) =>
  runEach(
    rows,
    (row) => row.name,
    async (row) => {
      const current = await getSchedule(scheduler, row.group, row.name);
      await scheduler.send(
        new UpdateScheduleCommand(
          toUpdateInput(current, {
            State: enabled ? SCHEDULE_STATES.enabled : SCHEDULE_STATES.disabled,
          }),
        ),
      );
    },
  );

export const deleteSchedules = (scheduler: SchedulerClient, rows: readonly ScheduleRow[]) =>
  runEach(
    rows,
    (row) => row.name,
    (row) => scheduler.send(new DeleteScheduleCommand({ GroupName: row.group, Name: row.name })),
  );
