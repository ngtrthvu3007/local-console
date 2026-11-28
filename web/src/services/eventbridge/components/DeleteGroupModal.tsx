import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { pluralize } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteGroup, useSchedules } from "../hooks/useSchedules.ts";

interface Props {
  group: string;
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteGroupModal({ group, onDismiss, onDone }: Props) {
  const deleteGroup = useDeleteGroup();
  const count = useSchedules(group).data?.length ?? 0;

  const submit = () =>
    deleteGroup.mutate(
      group,
      notifyOutcome({
        success: `Deleted schedule group ${group}`,
        errorHeader: `Couldn't delete ${group}`,
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete schedule group ${group}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteGroup.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {count > 0 && (
        <Alert type='warning'>
          {pluralize(count, "schedule")} in this group are deleted with it.
        </Alert>
      )}
    </ConfirmModal>
  );
}
