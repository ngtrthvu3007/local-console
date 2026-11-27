import Alert from "@cloudscape-design/components/alert";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
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
  // Event source mapping của stream cũ không tự mất khi xóa bảng
  const withStream = tables.some((table) => table.LatestStreamArn);

  return (
    <BulkActionModal
      mutation={deleteTables}
      items={names}
      lines={names}
      noun='table'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {withStream && (
        <Alert type='warning'>Lambda triggers on a deleted table's stream stop running.</Alert>
      )}
      <Alert type='warning'>Every item in these tables is deleted. This can't be undone.</Alert>
    </BulkActionModal>
  );
}
