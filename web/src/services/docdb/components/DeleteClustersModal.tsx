import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import type { ClusterRow } from "@localconsole/core/docdb";
import { useDeleteClusters } from "../hooks/useClusters.ts";

interface Props {
  clusters: readonly ClusterRow[];
  onDismiss: () => void;
  onDone: () => void;
}

export function DeleteClustersModal({ clusters, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useDeleteClusters()}
      items={clusters}
      lines={clusters.map((cluster) => cluster.id)}
      noun='cluster'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      Instances of these clusters are deleted with them. The data is gone; Floci leaves the MongoDB
      volume behind.
    </BulkActionModal>
  );
}
