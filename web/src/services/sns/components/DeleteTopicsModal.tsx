import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import { useDeleteTopics } from "../hooks/useTopics.ts";
import type { Topic } from "../topics.ts";

interface Props {
  topics: readonly Topic[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteTopicsModal({ topics, onDismiss, onDone }: Props) {
  const deleteTopics = useDeleteTopics();
  const hiddenCount = topics.length - DELETE_PREVIEW_COUNT;
  const lostSubscriptions = topics.reduce((total, topic) => total + topic.subscriptions, 0);
  const referenced = useReferencedNames(topics).data ?? [];

  const submit = () =>
    deleteTopics.mutate(
      topics,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "topic")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(topics.length, "topic")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteTopics.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {topics.slice(0, DELETE_PREVIEW_COUNT).map((topic) => (
          <div key={topic.name}>
            {topic.name} ({pluralize(topic.subscriptions, "subscription")})
          </div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      {lostSubscriptions > 0 && (
        <Alert type='warning'>
          {pluralize(lostSubscriptions, "subscription")} stop delivering.
        </Alert>
      )}
      <ReferencedWarning names={referenced} />
    </ConfirmModal>
  );
}
