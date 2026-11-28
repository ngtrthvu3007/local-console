import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { LIST_SEPARATOR } from "@shared/constants.ts";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import { useQueueLinks } from "../hooks/useQueueTriggers.ts";
import { useDeleteQueues } from "../hooks/useQueues.ts";
import type { Queue } from "../queues.ts";

interface Props {
  queues: readonly Queue[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteQueuesModal({ queues, onDismiss, onDone }: Props) {
  const deleteQueues = useDeleteQueues();
  const links = useQueueLinks(queues);
  const names = queues.map((queue) => queue.name);
  const withTriggers = links.data?.withTriggers ?? [];
  const deadLetterQueues = links.data?.deadLetterQueues ?? [];
  const referenced = useReferencedNames(queues).data ?? [];

  return (
    <BulkActionModal
      mutation={deleteQueues}
      items={queues}
      lines={names}
      noun='queue'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {withTriggers.length > 0 && (
        <Alert type='warning'>
          Lambda triggers on {withTriggers.join(LIST_SEPARATOR)} stop running.
        </Alert>
      )}
      {deadLetterQueues.length > 0 && (
        <Alert type='warning'>
          {deadLetterQueues.join(LIST_SEPARATOR)} {deadLetterQueues.length === 1 ? "is" : "are"} the
          dead-letter queue of other queues. Floci then drops their failed messages for good.
        </Alert>
      )}
      <ReferencedWarning names={referenced} />
      <Alert type='warning'>Every message in these queues is deleted. This can't be undone.</Alert>
    </BulkActionModal>
  );
}
