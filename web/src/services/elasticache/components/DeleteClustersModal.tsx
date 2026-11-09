import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteClusters, type Cluster } from "../hooks/useClusters.ts";

interface Props {
  clusters: readonly Cluster[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở. Một cluster thì gõ tên (giống AWS); nhiều cluster thì gõ "delete"
export function DeleteClustersModal({ clusters, onDismiss, onDone }: Props) {
  const deleteClusters = useDeleteClusters();
  const names = clusters.map((cluster) => cluster.id);
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    deleteClusters.mutate(
      [...clusters],
      notifyBulkOutcome({
        success: (result) => `Deleting ${pluralize(result.count, "cluster")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "cluster")}?`}
      confirmText={names.length === 1 ? names[0] : CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteClusters.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
          <div key={name}>{name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      <Alert type='warning'>Every key in these clusters is deleted. This can't be undone.</Alert>
    </ConfirmModal>
  );
}
