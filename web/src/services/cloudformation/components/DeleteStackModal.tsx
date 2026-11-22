import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteStack } from "../hooks/useStacks.ts";

interface Props {
  stack: string;
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteStackModal({ stack, onDismiss, onDone }: Props) {
  const deleteStack = useDeleteStack();

  const submit = () =>
    deleteStack.mutate(
      stack,
      notifyOutcome({
        success: `Deleted stack ${stack}`,
        errorHeader: `Couldn't delete ${stack}`,
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete stack ${stack}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteStack.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      Floci deletes every resource the stack created, except those with DeletionPolicy Retain. A
      bucket that still has objects fails to delete.
    </ConfirmModal>
  );
}
