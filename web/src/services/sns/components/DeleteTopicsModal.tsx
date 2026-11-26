import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { pluralize } from "@shared/format.ts";
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
  const lostSubscriptions = topics.reduce((total, topic) => total + topic.subscriptions, 0);
  const referenced = useReferencedNames(topics).data ?? [];

  return (
    <BulkActionModal
      mutation={deleteTopics}
      items={topics}
      lines={topics.map(
        (topic) => `${topic.name} (${pluralize(topic.subscriptions, "subscription")})`,
      )}
      noun='topic'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {lostSubscriptions > 0 && (
        <Alert type='warning'>
          {pluralize(lostSubscriptions, "subscription")} stop delivering.
        </Alert>
      )}
      <ReferencedWarning names={referenced} />
    </BulkActionModal>
  );
}
