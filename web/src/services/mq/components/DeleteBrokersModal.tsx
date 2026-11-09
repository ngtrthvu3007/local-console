import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
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
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;

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
      <Box>
        {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
          <div key={name}>{name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      <Alert type='warning'>Every queue and message in these brokers is deleted.</Alert>
    </ConfirmModal>
  );
}
