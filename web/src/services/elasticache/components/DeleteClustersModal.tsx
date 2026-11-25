import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
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
      <DeletePreview lines={names} />
      <Alert type='warning'>Every key in these clusters is deleted. This can't be undone.</Alert>
    </ConfirmModal>
  );
}
