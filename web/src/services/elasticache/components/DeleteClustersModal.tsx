import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { CONFIRM_DELETE } from "@shared/components/ConfirmModal.tsx";
import Alert from "@cloudscape-design/components/alert";
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

  return (
    <BulkActionModal
      mutation={deleteClusters}
      items={[...clusters]}
      lines={names}
      noun='cluster'
      done='Deleting'
      confirmText={names.length === 1 ? names[0] : CONFIRM_DELETE}
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>Every key in these clusters is deleted. This can't be undone.</Alert>
    </BulkActionModal>
  );
}
