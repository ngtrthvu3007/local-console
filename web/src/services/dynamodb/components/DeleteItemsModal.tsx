import Alert from "@cloudscape-design/components/alert";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
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

  const submit = () =>
    deleteItems.mutate(
      items,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "item")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
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
      <DeletePreview lines={items.map((item) => keyLabel(item, keys))} />
      <Alert type='warning'>This can't be undone.</Alert>
    </ConfirmModal>
  );
}
