import { taskDefinitionLabel } from "../arns.ts";
import { useDeleteRevisions, useDeregisterRevisions } from "../hooks/useTaskDefinitions.ts";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";

interface Props {
  action: "deregister" | "delete";
  arns: readonly string[];
  onDismiss: () => void;
  onDone: () => void;
}

const TEXT = {
  deregister: {
    verb: "Deregister",
    done: "Deregistered",
    body: "Deregistered revisions can't start new tasks or services. Running tasks keep running.",
  },
  delete: {
    verb: "Delete",
    done: "Deleted",
    body: "Floci keeps deleted revisions as Delete in progress, the same way AWS does until nothing uses them.",
  },
} as const;

export function RevisionActionModal({ action, arns, onDismiss, onDone }: Props) {
  const deregister = useDeregisterRevisions();
  const remove = useDeleteRevisions();
  const text = TEXT[action];

  return (
    <BulkActionModal
      mutation={action === "delete" ? remove : deregister}
      items={arns}
      lines={arns.map(taskDefinitionLabel)}
      noun='revision'
      verb={text.verb}
      done={text.done}
      confirmText={action === "delete" ? undefined : false}
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {text.body}
    </BulkActionModal>
  );
}
