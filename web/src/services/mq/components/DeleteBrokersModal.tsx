import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { CONFIRM_DELETE } from "@shared/components/ConfirmModal.tsx";
import Alert from "@cloudscape-design/components/alert";
import { useDeleteBrokers, type BrokerRef } from "../hooks/useBrokers.ts";

interface Props {
  brokers: BrokerRef[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở. Một broker thì gõ tên (giống AWS); nhiều broker thì gõ "delete"
export function DeleteBrokersModal({ brokers, onDismiss, onDone }: Props) {
  const deleteBrokers = useDeleteBrokers();
  const names = brokers.map((broker) => broker.name);

  return (
    <BulkActionModal
      mutation={deleteBrokers}
      items={brokers}
      lines={names}
      noun='broker'
      done='Deleting'
      confirmText={names.length === 1 ? names[0] : CONFIRM_DELETE}
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>Every queue and message in these brokers is deleted.</Alert>
    </BulkActionModal>
  );
}
