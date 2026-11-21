import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useClearSms } from "../hooks/useSms.ts";

interface Props {
  count: number; // số tin đang thấy, của region này
  onDismiss: () => void;
}

// Chỉ mount khi mở. DELETE /_aws/sns của Floci chỉ có xóa hết, không nhận id (spec SMS 7 #2)
export function ClearSmsModal({ count, onDismiss }: Props) {
  const clear = useClearSms();

  const submit = () =>
    clear.mutate(
      undefined,
      notifyOutcome({
        success: "Deleted all text messages",
        errorHeader: "Couldn't delete",
        then: onDismiss,
      }),
    );

  return (
    <ConfirmModal
      visible
      header='Delete all text messages'
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={clear.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Alert type='warning'>
        Floci only supports deleting all text messages at once. This deletes every text message in
        every region, not only the {count} shown here.
      </Alert>
    </ConfirmModal>
  );
}
