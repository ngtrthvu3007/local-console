import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { Message } from "@aws-sdk/client-sqs";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { ModalFooter } from "@shared/components/ModalFooter.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, ErrorState } from "@shared/components/TableStates.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { formatDuration, pluralize } from "@localconsole/core/shared";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useRunOnMount } from "@shared/hooks/useRunOnMount.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  bodyPreview,
  messageIdPreview,
  receiveCountOf,
  sendMessageSchema,
  type Queue,
} from "@localconsole/core/sqs";
import {
  useDeleteMessages,
  usePoll,
  usePurge,
  useSendMessage,
  useStartRedrive,
} from "../hooks/useMessages.ts";
import { SHORT_EDITOR_HEIGHT_PX } from "@shared/constants.ts";

// Các modal chỉ mount khi mở

interface QueueProps {
  queue: Queue;
  onDismiss: () => void;
}

// Gửi xong vẫn giữ modal và nội dung để gửi tiếp
export function SendMessageModal({ queue, onDismiss }: QueueProps) {
  const sendMessage = useSendMessage(queue);
  const form = useZodForm(
    sendMessageSchema({
      fifo: queue.fifo,
      contentBasedDedup: queue.settings.contentBasedDedup,
      maxMessageSize: queue.settings.maxMessageSize,
    }),
    { body: "", groupId: "", dedupId: "" },
  );

  const submit = form.handleSubmit((values) =>
    sendMessage.mutate(
      values,
      notifyOutcome({
        success: (result) => `Sent message ${result.MessageId}`,
        errorHeader: `Couldn't send to ${queue.name}`,
      }),
    ),
  );

  // SQS bỏ qua message FIFO trùng trong 5 phút mà không báo lỗi
  const dedupDescription = queue.settings.contentBasedDedup
    ? "Optional. Leave empty to use a hash of the body. Duplicates within 5 minutes are dropped silently."
    : "Required. Messages with the same ID within 5 minutes are dropped silently.";

  return (
    <FormModal
      header={`Send message to ${queue.name}`}
      actionText='Send'
      cancelText='Close'
      size='medium'
      loading={sendMessage.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormValueEditor
        control={form.control}
        name='body'
        label='Body'
        height={SHORT_EDITOR_HEIGHT_PX}
      />
      {queue.fifo && (
        <SpaceBetween size='m'>
          <FormInput
            control={form.control}
            name='groupId'
            label='Message group ID'
            description='Messages in the same group are delivered in order.'
            placeholder='order-42'
          />
          <FormInput
            control={form.control}
            name='dedupId'
            label='Deduplication ID'
            description={dedupDescription}
          />
        </SpaceBetween>
      )}
    </FormModal>
  );
}

const pollColumns: TableProps.ColumnDefinition<Message>[] = [
  { id: "id", header: "Message ID", isRowHeader: true, cell: messageIdPreview },
  {
    id: "received",
    header: <FigureHeader>Received</FigureHeader>,
    cell: (message) => <Figure>{receiveCountOf(message)}</Figure>,
  },
  { id: "body", header: "Body", cell: bodyPreview },
];

// Giả lập consumer: mở là poll ngay; message không xóa sẽ quay lại sau visibility timeout
export function PollModal({ queue, onDismiss }: QueueProps) {
  const poll = usePoll(queue);
  const deleteMessages = useDeleteMessages(queue);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message[]>([]);

  const run = () => {
    setSelected([]);
    poll.mutate(undefined, { onSuccess: setMessages });
  };
  useRunOnMount(() => poll.mutate(undefined, { onSuccess: setMessages }));

  const remove = () =>
    deleteMessages.mutate(
      selected,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "message")}`,
        errorHeader: "Couldn't delete",
        then: () => {
          const deletedIds = new Set(selected.map((message) => message.MessageId));
          setMessages((current) => current.filter((message) => !deletedIds.has(message.MessageId)));
          setSelected([]);
        },
      }),
    );

  const maxReceiveCount = queue.redrivePolicy?.maxReceiveCount;
  const warning = [
    `Polled messages are hidden for the visibility timeout (${formatDuration(queue.settings.visibilityTimeout)}) and their receive count goes up.`,
    maxReceiveCount && `After ${pluralize(maxReceiveCount, "receive")} they move to the DLQ.`,
  ]
    .filter(Boolean)
    .join(" ");

  const footer = (
    <ModalFooter
      actionText='Poll again'
      cancelText='Close'
      loading={poll.isPending}
      onAction={run}
      onCancel={onDismiss}
    />
  );

  const deleteButton = (
    <Button disabled={!selected.length} loading={deleteMessages.isPending} onClick={remove}>
      Delete
    </Button>
  );

  return (
    <Modal visible size='large' header={`Poll ${queue.name}`} footer={footer} onDismiss={onDismiss}>
      <SpaceBetween size='m'>
        <Alert type='warning'>{warning}</Alert>
        {poll.isError ? (
          <ErrorState error={poll.error} onRetry={run} />
        ) : (
          <Table
            variant='embedded'
            selectionType='multi'
            ariaLabels={selectionLabels<Message>("message", (item) => item.MessageId ?? "")}
            trackBy='MessageId'
            items={messages}
            selectedItems={selected}
            onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
            loading={poll.isPending}
            loadingText='Polling for messages'
            columnDefinitions={pollColumns}
            wrapLines
            empty={
              <EmptyState
                title='No messages available'
                description='Messages in flight show up again after the visibility timeout.'
              />
            }
            header={
              <Header counter={`(${messages.length})`} actions={deleteButton}>
                Received messages
              </Header>
            }
          />
        )}
      </SpaceBetween>
    </Modal>
  );
}

export function PurgeModal({ queue, onDismiss }: QueueProps) {
  const purge = usePurge(queue);
  const submit = () =>
    purge.mutate(
      undefined,
      notifyOutcome({
        success: `Purged ${queue.name}`,
        errorHeader: `Couldn't purge ${queue.name}`,
        then: onDismiss,
      }),
    );
  return (
    <ConfirmModal
      visible
      header={`Purge ${queue.name}?`}
      confirmText={queue.name}
      actionText='Purge'
      loading={purge.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        Every message in the queue is deleted (
        {pluralize(queue.available + queue.inFlight, "message")}
        ). This can't be undone.
      </Box>
    </ConfirmModal>
  );
}

// Queue là DLQ: chuyển hết message về queue gốc của từng message
export function RedriveModal({ queue, sources, onDismiss }: QueueProps & { sources: string[] }) {
  const redrive = useStartRedrive(queue, sources);
  const submit = () =>
    redrive.mutate(
      undefined,
      notifyOutcome({
        success: `Started moving messages from ${queue.name}`,
        errorHeader: `Couldn't start the redrive`,
        then: onDismiss,
      }),
    );
  return (
    <ConfirmModal
      visible
      header='Start DLQ redrive?'
      actionText='Start redrive'
      loading={redrive.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {pluralize(queue.available, "message")} {queue.available === 1 ? "moves" : "move"} from{" "}
        {queue.name} back to the queue each came from: {sources.join(", ")}.
      </Box>
    </ConfirmModal>
  );
}
