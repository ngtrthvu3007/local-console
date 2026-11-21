import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  ResourceNotFoundException,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import { isNotFoundError } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { SCHEDULE_STATES } from "../constants.ts";
import {
  listScheduleGroups,
  listSchedules,
  toUpdateInput,
  type ScheduleRow,
} from "../schedules.ts";
import { EVENTBRIDGE_QUERY_ROOT, invalidateExcept, useInvalidateEventBridge } from "./useBuses.ts";
import { useScheduler } from "./useScheduler.ts";

const SCHEDULER_ROOT = [EVENTBRIDGE_QUERY_ROOT, "scheduler"];
const scheduleListKey = (group?: string) => [...SCHEDULER_ROOT, "list", group ?? ""];
const scheduleKey = (group: string, name: string) => [...SCHEDULER_ROOT, "schedule", group, name];
const groupsKey = [...SCHEDULER_ROOT, "groups"];

export const isScheduleMissing = (error: unknown) =>
  error instanceof ResourceNotFoundException || isNotFoundError(error);

// group rỗng = mọi group
export function useSchedules(group?: string) {
  const client = useScheduler();
  return useQuery({
    queryKey: scheduleListKey(group),
    queryFn: () => listSchedules(client, group),
  });
}

export function useScheduleGroups() {
  const client = useScheduler();
  return useQuery({
    queryKey: groupsKey,
    queryFn: () => listScheduleGroups(client),
  });
}

export function useSchedule(group: string, name: string) {
  const client = useScheduler();
  return useQuery({
    queryKey: scheduleKey(group, name),
    queryFn: () => client.send(new GetScheduleCommand({ GroupName: group, Name: name })),
    retry: false,
    // Trang tạo chưa có tên để hỏi
    enabled: Boolean(name),
  });
}

export function useCreateGroup() {
  const client = useScheduler();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: (name: string) => client.send(new CreateScheduleGroupCommand({ Name: name })),
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const client = useScheduler();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    // Xóa group xóa luôn schedule trong đó (Floci giống AWS)
    mutationFn: (name: string) => client.send(new DeleteScheduleGroupCommand({ Name: name })),
    onSuccess: invalidate,
  });
}

type SaveScheduleInput = Omit<CreateScheduleCommandInput, "ClientToken">;

// Sửa: UpdateSchedule ghi đè cả schedule nên input đã gộp với dữ liệu hiện có ở form
export function useSaveSchedule(editing: boolean) {
  const client = useScheduler();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: (input: SaveScheduleInput) =>
      client.send(editing ? new UpdateScheduleCommand(input) : new CreateScheduleCommand(input)),
    onSuccess: invalidate,
  });
}

// API không có lệnh bật / tắt: đọc lại schedule rồi ghi với State mới
export function useSetSchedulesEnabled() {
  const client = useScheduler();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: ({ rows, enabled }: { rows: readonly ScheduleRow[]; enabled: boolean }) =>
      runEach(
        rows,
        (row) => row.name,
        async (row) => {
          const current = await client.send(
            new GetScheduleCommand({ GroupName: row.group, Name: row.name }),
          );
          await client.send(
            new UpdateScheduleCommand(
              toUpdateInput(current, {
                State: enabled ? SCHEDULE_STATES.enabled : SCHEDULE_STATES.disabled,
              }),
            ),
          );
        },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteSchedules() {
  const client = useScheduler();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: readonly ScheduleRow[]) =>
      runEach(
        rows,
        (row) => row.name,
        (row) => client.send(new DeleteScheduleCommand({ GroupName: row.group, Name: row.name })),
      ),
    onSuccess: (_result, rows) =>
      invalidateExcept(
        queryClient,
        rows.map((row) => scheduleKey(row.group, row.name)),
      ),
  });
}
