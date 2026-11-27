import { taskIdOf } from "@localconsole/core/ecs";
import { useStopTasks } from "../hooks/useTasks.ts";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";

interface Props {
  cluster: string;
  arns: readonly string[];
  onDismiss: () => void;
  onDone: () => void;
}

export function StopTasksModal({ cluster, arns, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useStopTasks(cluster)}
      items={arns}
      lines={arns.map(taskIdOf)}
      noun='task'
      verb='Stop'
      done='Stopping'
      confirmText={false}
      onDismiss={onDismiss}
      onDone={onDone}
    >
      Floci stops the containers. A task that belongs to a service is replaced by a new one.
    </BulkActionModal>
  );
}
