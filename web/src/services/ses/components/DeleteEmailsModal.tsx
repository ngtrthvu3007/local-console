import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteEmails } from "../hooks/useMailbox.ts";
import { NO_SUBJECT } from "../constants.ts";
import type { Email } from "../mailbox.ts";

interface Props {
  emails: readonly Email[];
  all: boolean;
  onDismiss: () => void;
  onDeleted?: () => void;
}

// Chỉ mount khi mở
export function DeleteEmailsModal({ emails, all, onDismiss, onDeleted }: Props) {
  const { region } = useLoadedConfig();
  const deleteEmails = useDeleteEmails();

  const submit = () =>
    deleteEmails.mutate(
      emails.map((email) => email.Id),
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "email")}`,
        errorHeader: "Couldn't delete",
        then: onDeleted,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={all ? "Delete all emails" : `Delete ${pluralize(emails.length, "email")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteEmails.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={emails.map((email) => email.Subject || NO_SUBJECT)} />
      {all && <Box>Only emails in {region} are deleted.</Box>}
    </ConfirmModal>
  );
}
