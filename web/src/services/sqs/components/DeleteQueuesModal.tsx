import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import { useQueueLinks } from "../hooks/useQueueTriggers.ts";
import { useDeleteQueues } from "../hooks/useQueues.ts";
import type { Queue } from "../queues.ts";

const LIST_SEPARATOR = ", ";

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
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;
  const withTriggers = links.data?.withTriggers ?? [];
  const deadLetterQueues = links.data?.deadLetterQueues ?? [];
  const referenced = useReferencedNames(queues).data ?? [];

  const submit = () =>
    deleteQueues.mutate(
      queues,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "queue")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  const preview = (
    <Box>
      {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
        <div key={name}>{name}</div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "queue")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteQueues.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {preview}
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
    </ConfirmModal>
  );
}
