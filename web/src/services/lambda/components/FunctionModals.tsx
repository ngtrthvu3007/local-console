import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Checkbox from "@cloudscape-design/components/checkbox";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteFunctions, type FunctionToDelete } from "../hooks/useFunctions.ts";

interface Props {
  functions: FunctionToDelete[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở. Floci tự xóa code của function nhưng giữ log group (giống AWS)
export function DeleteFunctionsModal({ functions, onDismiss, onDone }: Props) {
  const deleteFunctions = useDeleteFunctions();
  const [deleteLogGroups, setDeleteLogGroups] = useState(true);
  const hiddenCount = functions.length - DELETE_PREVIEW_COUNT;
  const logGroupLabel =
    functions.length === 1 ? `log group ${functions[0].logGroup}` : "their log groups";

  const submit = () =>
    deleteFunctions.mutate(
      { functions, deleteLogGroups },
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "function")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  const preview = (
    <Box>
      {functions.slice(0, DELETE_PREVIEW_COUNT).map((item) => (
        <div key={item.name}>{item.name}</div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(functions.length, "function")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteFunctions.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {preview}
      <Checkbox
        checked={deleteLogGroups}
        onChange={({ detail }) => setDeleteLogGroups(detail.checked)}
      >
        Also delete {logGroupLabel}
      </Checkbox>
      <Alert type='warning'>This can't be undone.</Alert>
    </ConfirmModal>
  );
}
