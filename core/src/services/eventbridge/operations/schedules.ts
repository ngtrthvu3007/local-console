import {
  paginateListScheduleGroups,
  paginateListSchedules,
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
  type SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { SCHEDULE_STATES } from "#services/eventbridge/constants.ts";
import { toScheduleRow, toUpdateInput, type ScheduleRow } from "#services/eventbridge/schedules.ts";

export type SaveScheduleInput = Omit<CreateScheduleCommandInput, "ClientToken">;

// group rỗng = mọi group
export const listSchedules = async (scheduler: SchedulerClient, group?: string) =>
  (
    await collectPages(
      paginateListSchedules({ client: scheduler }, { GroupName: group }),
      (page) => page.Schedules,
    )
  ).map(toScheduleRow);

export const listScheduleGroups = async (scheduler: SchedulerClient) =>
  (
    await collectPages(
      paginateListScheduleGroups({ client: scheduler }, {}),
      (page) => page.ScheduleGroups,
    )
  ).map((group) => group.Name ?? "");

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
