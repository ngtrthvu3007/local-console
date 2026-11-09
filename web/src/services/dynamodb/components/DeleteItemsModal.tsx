import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { keyLabel, type Item } from "../itemJson.ts";
import { useDeleteItems } from "../hooks/useItems.ts";
import { keySchemaOf } from "../hooks/useTables.ts";

interface Props {
  table: TableDescription;
  items: Item[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteItemsModal({ table, items, onDismiss, onDone }: Props) {
  const keys = keySchemaOf(table);
  const deleteItems = useDeleteItems(table.TableName!, keys);
  const hiddenCount = items.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    deleteItems.mutate(
      items,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "item")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  const preview = (
    <Box>
      {items.slice(0, DELETE_PREVIEW_COUNT).map((item) => (
        <div key={keyLabel(item, keys)}>{keyLabel(item, keys)}</div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(items.length, "item")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteItems.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {preview}
      <Alert type='warning'>This can't be undone.</Alert>
    </ConfirmModal>
  );
}
