import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveScheduleInput, ScheduleRow } from "@localconsole/core/eventbridge";
import { EVENTBRIDGE_QUERY_ROOT, invalidateExcept, useInvalidateEventBridge } from "./useBuses.ts";
import { useEventBridgeService } from "./useEventBridgeService.ts";

const SCHEDULER_ROOT = [EVENTBRIDGE_QUERY_ROOT, "scheduler"];
const scheduleListKey = (group?: string) => [...SCHEDULER_ROOT, "list", group ?? ""];
const scheduleKey = (group: string, name: string) => [...SCHEDULER_ROOT, "schedule", group, name];
const groupsKey = [...SCHEDULER_ROOT, "groups"];

export function useSchedules(group?: string) {
  const eventbridge = useEventBridgeService();

  return useQuery({
    queryKey: scheduleListKey(group),
    queryFn: () => eventbridge.listSchedules(group),
  });
}

export function useScheduleGroups() {
  const eventbridge = useEventBridgeService();

  return useQuery({ queryKey: groupsKey, queryFn: eventbridge.listScheduleGroups });
}

export function useSchedule(group: string, name: string) {
  const eventbridge = useEventBridgeService();

  return useQuery({
    queryKey: scheduleKey(group, name),
    queryFn: () => eventbridge.getSchedule(group, name),
    retry: false,
    // Trang tạo chưa có tên để hỏi
    enabled: Boolean(name),
  });
}

export function useCreateGroup() {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({ mutationFn: eventbridge.createScheduleGroup, onSuccess: invalidate });
}

export function useDeleteGroup() {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({ mutationFn: eventbridge.deleteScheduleGroup, onSuccess: invalidate });
}

export function useSaveSchedule(editing: boolean) {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({
    mutationFn: (input: SaveScheduleInput) => eventbridge.saveSchedule(input, editing),
    onSuccess: invalidate,
  });
}

export function useSetSchedulesEnabled() {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({
    mutationFn: ({ rows, enabled }: { rows: readonly ScheduleRow[]; enabled: boolean }) =>
      eventbridge.setSchedulesEnabled(rows, enabled),
    onSuccess: invalidate,
  });
}

export function useDeleteSchedules() {
  const eventbridge = useEventBridgeService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: eventbridge.deleteSchedules,
    onSuccess: (_result, rows) =>
      invalidateExcept(
        queryClient,
        rows.map((row) => scheduleKey(row.group, row.name)),
      ),
  });
}
