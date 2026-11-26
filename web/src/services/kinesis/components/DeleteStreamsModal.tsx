import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { LIST_SEPARATOR } from "@shared/constants.ts";
import { useDeleteStreams, useStreamsWithTriggers, type StreamRow } from "../hooks/useStreams.ts";

interface Props {
  streams: readonly Pick<StreamRow, "name" | "arn">[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteStreamsModal({ streams, onDismiss, onDone }: Props) {
  const deleteStreams = useDeleteStreams();
  const withTriggers = useStreamsWithTriggers(streams).data ?? [];
  const names = streams.map((stream) => stream.name);

  return (
    <BulkActionModal
      mutation={deleteStreams}
      items={names}
      lines={names}
      noun='data stream'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {withTriggers.length > 0 && (
        <Alert type='warning'>
          {withTriggers.join(LIST_SEPARATOR)} {withTriggers.length === 1 ? "has" : "have"} Lambda
          triggers. Floci keeps Lambda triggers of a deleted stream: delete them in Lambda ›
          Triggers.
        </Alert>
      )}
      <Alert type='warning'>Every record in these streams is deleted. This can't be undone.</Alert>
    </BulkActionModal>
  );
}
