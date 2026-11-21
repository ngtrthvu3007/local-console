import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteSchedules } from "../hooks/useSchedules.ts";
import type { ScheduleRow } from "../schedules.ts";

interface Props {
  schedules: readonly ScheduleRow[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteSchedulesModal({ schedules, onDismiss, onDone }: Props) {
  const deleteSchedules = useDeleteSchedules();

  const submit = () =>
    deleteSchedules.mutate(
      schedules,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "schedule")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(schedules.length, "schedule")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteSchedules.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={schedules.map((schedule) => `${schedule.name} (${schedule.group})`)} />
    </ConfirmModal>
  );
}
