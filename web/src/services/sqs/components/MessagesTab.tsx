import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";
import type { Message } from "@aws-sdk/client-sqs";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { usePeek } from "../hooks/useMessages.ts";
import {
  bodyPreview,
  bodyText,
  messageAttributeText,
  messageIdPreview,
  receiveCountOf,
  sentText,
  systemAttributeText,
  messageCountsText,
  type Queue,
  SEARCH_PARAMS,
} from "@localconsole/core/sqs";
import { PollModal } from "./MessageModals.tsx";

// Panel chi tiết: body đầy đủ, system attribute (FIFO có group ID, dedup ID, sequence number)
function MessageDetails({ message }: { message: Message }) {
  const systemAttributes = Object.entries(message.Attributes ?? {}).map(([label, value]) => ({
    label,
    value: systemAttributeText(label, value),
  }));
  const messageAttributes = Object.entries(message.MessageAttributes ?? {}).map(
    ([label, value]) => ({ label, value: messageAttributeText(value) }),
  );
  return (
    <SpaceBetween size='l'>
      <CodeSnippet code={bodyText(message)} wrap />
      {messageAttributes.length > 0 && (
        <SpaceBetween size='s'>
          <Header variant='h3'>Message attributes</Header>
          <KeyValuePairs items={messageAttributes} />
        </SpaceBetween>
      )}
      <SpaceBetween size='s'>
        <Header variant='h3'>System attributes</Header>
        <KeyValuePairs items={systemAttributes} />
      </SpaceBetween>
    </SpaceBetween>
  );
}

interface Props {
  queue: Queue;
  autoRefresh: boolean;
  onAutoRefreshChange: (autoRefresh: boolean) => void;
}

export function MessagesTab({ queue, autoRefresh, onAutoRefreshChange }: Props) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const peek = usePeek(queue, autoRefresh);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get(SEARCH_PARAMS.message) ?? undefined;
  const [polling, setPolling] = useState(false);
  const messages = peek.data ?? [];
  const openMessage = messages.find((message) => message.MessageId === openId);

  // ---------- Panel: message đang mở lưu trên URL, giống key của ElastiCache ----------

  const messageHref = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.message, id);
    return `?${next}`;
  };
  // Mở từ trạng thái đóng thì thêm vào lịch sử; đổi message khi đang mở thì thay.
  // Nhờ vậy nút Back luôn đóng panel
  const openMessageById = (id: string) => navigate(messageHref(id), { replace: Boolean(openId) });
  const closeMessage = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SEARCH_PARAMS.message);
        return next;
      },
      { replace: true },
    );

  useSplitPanel(
    openMessage
      ? {
          header: openMessage.MessageId!,
          description: sentText(openMessage),
          onClose: closeMessage,
          body: <MessageDetails message={openMessage} />,
        }
      : null,
  );

  const idLink = (message: Message) => (
    <Link
      href={messageHref(message.MessageId!)}
      onFollow={(event) => {
        event.preventDefault();
        openMessageById(message.MessageId!);
      }}
    >
      {/* Message đang mở in đậm: Table của Cloudscape không có kiểu dòng "đang mở" riêng */}
      {message.MessageId === openId ? (
        <strong>{messageIdPreview(message)}</strong>
      ) : (
        messageIdPreview(message)
      )}
    </Link>
  );
  const receivedColumn: TableProps.ColumnDefinition<Message> = {
    id: "received",
    header: <FigureHeader>Received</FigureHeader>,
    cell: (message) => <Figure>{receiveCountOf(message)}</Figure>,
  };
  const wideColumns: TableProps.ColumnDefinition<Message>[] = [
    { id: "id", header: "Message ID", isRowHeader: true, cell: idLink },
    { id: "sent", header: "Sent", cell: sentText },
    receivedColumn,
    { id: "body", header: "Body", cell: bodyPreview },
  ];
  // Khung hẹp: tầng 1 là ID, tầng 2 là thời điểm gửi · body, xám
  const compactColumns: TableProps.ColumnDefinition<Message>[] = [
    {
      id: "id",
      header: "Message ID",
      isRowHeader: true,
      cell: (message) => (
        <div>
          {idLink(message)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[sentText(message), bodyPreview(message)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    receivedColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(peek),
    // Ghim: tab không có nút chính, khung hẹp không gom Poll vào menu một mục
    { id: "poll", text: "Poll for messages", pinned: true, onClick: () => setPolling(true) },
  ];

  const header = (
    <Header
      counter={peek.data ? `(${messages.length})` : undefined}
      description={`${messageCountsText(queue)}. Peek doesn't change the queue. Use Poll to act as a consumer.`}
      actions={
        <ResponsiveActions>
          <Toggle
            checked={autoRefresh}
            onChange={({ detail }) => onAutoRefreshChange(detail.checked)}
          >
            Auto refresh
          </Toggle>
          <ActionBar compact={compact} actions={barActions} />
        </ResponsiveActions>
      }
    >
      Messages
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        trackBy='MessageId'
        items={messages}
        loading={peek.isLoading}
        loadingText='Loading messages'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        empty={emptyOrError(
          peek,
          <EmptyState title='No messages' description='Send a message to try a consumer.' />,
        )}
        header={header}
      />
      {polling && <PollModal queue={queue} onDismiss={() => setPolling(false)} />}
    </div>
  );
}
