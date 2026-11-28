import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteSchedules } from "../hooks/useSchedules.ts";
import type { ScheduleRow } from "@localconsole/core/eventbridge";

interface Props {
  schedules: readonly ScheduleRow[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteSchedulesModal({ schedules, onDismiss, onDone }: Props) {
  const deleteSchedules = useDeleteSchedules();

  return (
    <BulkActionModal
      mutation={deleteSchedules}
      items={schedules}
      lines={schedules.map((schedule) => `${schedule.name} (${schedule.group})`)}
      noun='schedule'
      onDismiss={onDismiss}
      onDone={onDone}
    ></BulkActionModal>
  );
}
