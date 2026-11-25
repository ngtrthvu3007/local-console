import Alert from "@cloudscape-design/components/alert";
import type { IdentityInfo } from "@aws-sdk/client-sesv2";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteIdentities } from "../hooks/useIdentities.ts";

interface Props {
  identities: readonly IdentityInfo[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteIdentitiesModal({ identities, onDismiss, onDone }: Props) {
  const deleteIdentities = useDeleteIdentities();
  const names = identities.flatMap((identity) => identity.IdentityName ?? []);

  const submit = () =>
    deleteIdentities.mutate(
      names,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "identity", "identities")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "identity", "identities")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteIdentities.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={names} />
      <Alert type='warning'>Your app can't send from these addresses after you delete them.</Alert>
    </ConfirmModal>
  );
}
