import Alert from "@cloudscape-design/components/alert";
import type { IdentityInfo } from "@aws-sdk/client-sesv2";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
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

  return (
    <BulkActionModal
      mutation={deleteIdentities}
      items={names}
      lines={names}
      noun='identity'
      nouns='identities'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>Your app can't send from these addresses after you delete them.</Alert>
    </BulkActionModal>
  );
}
