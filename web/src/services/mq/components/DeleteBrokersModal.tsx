import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
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

  const submit = () =>
    deleteBrokers.mutate(
      brokers,
      notifyBulkOutcome({
        success: (result) => `Deleting ${pluralize(result.count, "broker")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "broker")}?`}
      confirmText={names.length === 1 ? names[0] : CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteBrokers.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={names} />
      <Alert type='warning'>Every queue and message in these brokers is deleted.</Alert>
    </ConfirmModal>
  );
}
