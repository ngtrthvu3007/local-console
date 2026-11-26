import Alert from "@cloudscape-design/components/alert";
import type { UserPoolDescriptionType } from "@aws-sdk/client-cognito-identity-provider";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteUserPools } from "../hooks/usePools.ts";

interface Props {
  pools: readonly UserPoolDescriptionType[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeletePoolsModal({ pools, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useDeleteUserPools()}
      items={[...pools]}
      lines={pools.map((pool) => pool.Name)}
      noun='user pool'
      header='Delete user pools'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>
        Users, groups, app clients and domains of these pools are deleted too.
      </Alert>
    </BulkActionModal>
  );
}
