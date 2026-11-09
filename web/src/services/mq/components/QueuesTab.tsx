import { useEffect, useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import type { Queue } from "@server/routes/rabbitmq/contract.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import {
  DELETE_PREVIEW_COUNT,
  DETAIL_SEPARATOR,
  ITEM_LIST_WIDTH_PX,
  NOT_AVAILABLE,
} from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { isUnauthorized, useDeleteQueues, usePurgeQueue, useQueues } from "../hooks/useRabbit.ts";
import { CreateQueueModal, PeekModal, PublishModal } from "./QueueModals.tsx";

const NAME_FIELD = "name";
const PAGE_SIZE = 50;

type Modal =
  | { id: "create" }
  | { id: "publish"; queue?: string }
  | { id: "peek"; queue: string }
  | { id: "purge"; queue: string }
  | { id: "delete" };

const durableText = (queue: Queue) => (queue.durable ? "Durable" : "Transient");

interface Props {
  broker: string;
  authorization: string;
  onUnauthorized: () => void; // sai user/pass: quay lại form đăng nhập
}

export function QueuesTab({ broker, authorization, onUnauthorized }: Props) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const closeModal = () => setModal(null);
  const queues = useQueues(broker, authorization, autoRefresh);
  const deleteQueues = useDeleteQueues(broker, authorization);
  const purge = usePurgeQueue(broker, authorization);
  const modalProps = { broker, authorization, onDismiss: closeModal };

  const unauthorized = isUnauthorized(queues.error);
  useEffect(() => {
    if (unauthorized) onUnauthorized();
  }, [unauthorized, onUnauthorized]);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Queue>(queues.data ?? [], {
      filtering: {
        empty: emptyOrError(
          queues,
          <EmptyState
            title='No queues'
            description='Your app usually declares its queues when it starts.'
            action={<Button onClick={() => setModal({ id: "create" })}>Create queue</Button>}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const single = selected.length === 1 ? selected[0] : undefined;

  const nameLink = (queue: Queue) => (
    <Link
      href='#'
      onFollow={(event) => {
        event.preventDefault();
        setModal({ id: "peek", queue: queue.name });
      }}
    >
      {queue.name}
    </Link>
  );
  const messagesColumn: TableProps.ColumnDefinition<Queue> = {
    id: "messages",
    header: <FigureHeader>Messages</FigureHeader>,
    sortingField: "messages",
    // Chưa có thống kê thì "—", không in 0 vì chưa biết
    cell: (queue) => <Figure>{queue.messages?.toLocaleString() ?? NOT_AVAILABLE}</Figure>,
  };
  const wideColumns: TableProps.ColumnDefinition<Queue>[] = [
    { id: "name", header: "Name", sortingField: NAME_FIELD, isRowHeader: true, cell: nameLink },
    { id: "type", header: "Type", cell: (queue) => queue.type },
    { id: "durable", header: "Durability", cell: durableText },
    messagesColumn,
  ];
  // Khung hẹp: tầng 1 là tên và số message, tầng 2 là type · durability, xám
  const compactColumns: TableProps.ColumnDefinition<Queue>[] = [
    {
      id: "name",
      header: "Name",
      sortingField: NAME_FIELD,
      isRowHeader: true,
      cell: (queue) => (
        <div>
          {nameLink(queue)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[queue.type, durableText(queue)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    messagesColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(queues),
    {
      id: "publish",
      text: "Publish message",
      onClick: () => setModal({ id: "publish", queue: single?.name }),
    },
    {
      id: "create",
      text: "Create queue",
      primary: true,
      onClick: () => setModal({ id: "create" }),
    },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: "peek", text: "Peek messages", disabled: !single },
    { id: "purge", text: "Purge", disabled: !single },
    { id: "delete", text: "Delete", disabled: !selected.length },
  ];
  const onMenuItemClick = (id: string) => {
    if (id === "delete") return setModal({ id: "delete" });
    if (single) setModal({ id: id === "purge" ? "purge" : "peek", queue: single.name });
  };

  const header = (
    <Header
      counter={queues.data ? `(${queues.data.length})` : undefined}
      description='Message counts update about every 5 seconds.'
      actions={
        <SpaceBetween direction='horizontal' size='s' alignItems='center'>
          <Toggle checked={autoRefresh} onChange={({ detail }) => setAutoRefresh(detail.checked)}>
            Auto refresh
          </Toggle>
          <ActionBar
            compact={compact}
            actions={barActions}
            menuItems={menuItems}
            onMenuItemClick={onMenuItemClick}
          />
        </SpaceBetween>
      }
    >
      Queues
    </Header>
  );

  const selectedNames = selected.map((queue) => queue.name);
  const confirmDelete = () =>
    deleteQueues.mutate(
      selectedNames,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "queue")}`,
        errorHeader: "Couldn't delete",
        then: () => {
          actions.setSelectedItems([]);
          closeModal();
        },
      }),
    );
  const confirmPurge = (queue: string) =>
    purge.mutate(
      queue,
      notifyOutcome({
        success: `Purged ${queue}`,
        errorHeader: `Couldn't purge ${queue}`,
        then: closeModal,
      }),
    );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='container'
        selectionType='multi'
        trackBy={NAME_FIELD}
        items={items}
        loading={queues.isLoading}
        loadingText='Loading queues'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find queues by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />

      {modal?.id === "create" && <CreateQueueModal {...modalProps} />}
      {modal?.id === "publish" && <PublishModal {...modalProps} queue={modal.queue} />}
      {modal?.id === "peek" && <PeekModal {...modalProps} queue={modal.queue} />}
      <ConfirmModal
        visible={modal?.id === "purge"}
        header={modal?.id === "purge" ? `Purge ${modal.queue}?` : ""}
        confirmText={modal?.id === "purge" ? modal.queue : undefined}
        actionText='Purge'
        loading={purge.isPending}
        onConfirm={() => modal?.id === "purge" && confirmPurge(modal.queue)}
        onDismiss={closeModal}
      >
        <Box>Every message in this queue is deleted. This can't be undone.</Box>
      </ConfirmModal>
      <ConfirmModal
        visible={modal?.id === "delete"}
        header={`Delete ${pluralize(selected.length, "queue")}?`}
        confirmText={CONFIRM_DELETE}
        actionText='Delete'
        loading={deleteQueues.isPending}
        onConfirm={confirmDelete}
        onDismiss={closeModal}
      >
        <Box>
          {selectedNames.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
            <div key={name}>{name}</div>
          ))}
        </Box>
      </ConfirmModal>
    </div>
  );
}
