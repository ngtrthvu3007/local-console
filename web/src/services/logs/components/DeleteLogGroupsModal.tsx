import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteLogGroups } from "../hooks/useLogGroups.ts";

interface Props {
  names: readonly string[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteLogGroupsModal({ names, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useDeleteLogGroups()}
      items={names}
      lines={names}
      noun='log group'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      Log streams, events and subscription filters of these groups are deleted too.
    </BulkActionModal>
  );
}
