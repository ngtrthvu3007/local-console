import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { UserPoolDescriptionType } from "@aws-sdk/client-cognito-identity-provider";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteUserPools } from "../hooks/usePools.ts";

interface Props {
  pools: readonly UserPoolDescriptionType[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeletePoolsModal({ pools, onDismiss, onDone }: Props) {
  const deletePools = useDeleteUserPools();
  const hiddenCount = pools.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    deletePools.mutate(
      [...pools],
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "user pool")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header='Delete user pools'
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deletePools.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {pools.slice(0, DELETE_PREVIEW_COUNT).map((pool) => (
          <div key={pool.Id}>{pool.Name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      <Alert type='warning'>
        Users, groups, app clients and domains of these pools are deleted too.
      </Alert>
    </ConfirmModal>
  );
}
