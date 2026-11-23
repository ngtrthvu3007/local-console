import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
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
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;

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
      <Box>
        {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
          <div key={name}>{name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
    </ConfirmModal>
  );
}
