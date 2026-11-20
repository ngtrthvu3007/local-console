import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { IdentityInfo } from "@aws-sdk/client-sesv2";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
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
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;

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
      <Box>
        {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
          <div key={name}>{name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      <Alert type='warning'>Your app can't send from these addresses after you delete them.</Alert>
    </ConfirmModal>
  );
}
