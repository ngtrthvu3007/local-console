import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteTables } from "../hooks/useTables.ts";

interface Props {
  tables: readonly TableDescription[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteTablesModal({ tables, onDismiss, onDone }: Props) {
  const deleteTables = useDeleteTables();
  const names = tables.map((table) => table.TableName!);
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;
  // Event source mapping của stream cũ không tự mất khi xóa bảng
  const withStream = tables.some((table) => table.LatestStreamArn);

  const submit = () =>
    deleteTables.mutate(
      names,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "table")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  const preview = (
    <Box>
      {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
        <div key={name}>{name}</div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "table")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteTables.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {preview}
      {withStream && (
        <Alert type='warning'>Lambda triggers on a deleted table's stream stop running.</Alert>
      )}
      <Alert type='warning'>Every item in these tables is deleted. This can't be undone.</Alert>
    </ConfirmModal>
  );
}
