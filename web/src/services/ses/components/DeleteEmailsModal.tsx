import Box from "@cloudscape-design/components/box";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { pluralize } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useDeleteEmails } from "../hooks/useMailbox.ts";
import { NO_SUBJECT } from "../constants.ts";
import type { Email } from "../mailbox.ts";

interface Props {
  emails: readonly Email[];
  all: boolean;
  onDismiss: () => void;
  onDeleted: () => void;
}

// Chỉ mount khi mở
export function DeleteEmailsModal({ emails, all, onDismiss, onDeleted }: Props) {
  const { region } = useLoadedConfig();
  const deleteEmails = useDeleteEmails();

  return (
    <BulkActionModal
      mutation={deleteEmails}
      items={emails.map((email) => email.Id)}
      lines={emails.map((email) => email.Subject || NO_SUBJECT)}
      noun='email'
      header={all ? "Delete all emails" : `Delete ${pluralize(emails.length, "email")}?`}
      onDismiss={onDismiss}
      onDone={onDeleted}
    >
      {all && <Box>Only emails in {region} are deleted.</Box>}
    </BulkActionModal>
  );
}
