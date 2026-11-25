import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteParameters } from "../hooks/useParameters.ts";

interface Props {
  names: readonly string[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteParametersModal({ names, onDismiss, onDone }: Props) {
  const deleteParameters = useDeleteParameters();

  const submit = () =>
    deleteParameters.mutate(
      names,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "parameter")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "parameter")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteParameters.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={names} />
    </ConfirmModal>
  );
}
