import Alert from "@cloudscape-design/components/alert";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { keyLabel, type Item, keySchemaOf } from "@localconsole/core/dynamodb";
import { useDeleteItems } from "../hooks/useItems.ts";

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

  return (
    <BulkActionModal
      mutation={deleteItems}
      items={items}
      lines={items.map((item) => keyLabel(item, keys))}
      noun='item'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>This can't be undone.</Alert>
    </BulkActionModal>
  );
}
