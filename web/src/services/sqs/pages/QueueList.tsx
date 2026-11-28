import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeleteQueuesModal } from "../components/DeleteQueuesModal.tsx";
import { useQueues } from "../hooks/useQueues.ts";
import { queueTypeLabel, type Queue } from "../queues.ts";
import { sqsBaseCrumbs, sqsRoutes } from "../routes.ts";

const QUEUE_NAME_FIELD = "name";

export function QueueList() {
  useBreadcrumbs(sqsBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const queues = useQueues();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={sqsRoutes.createQueue} onFollow={follow}>
      Create queue
    </Button>
  );

  const emptyState = emptyOrError(
    queues,
    <EmptyState
      title='No queues'
      description={`You don't have any queues in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Queue>(queues.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: QUEUE_NAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: QUEUE_NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameLink = (queue: Queue) => (
    <Link href={sqsRoutes.queue(queue.name)} onFollow={follow}>
      {queue.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<Queue> = {
    id: "name",
    header: "Name",
    sortingField: QUEUE_NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const availableColumn: TableProps.ColumnDefinition<Queue> = {
    id: "available",
    header: <FigureHeader>Available</FigureHeader>,
    sortingField: "available",
    cell: (queue) => <Figure>{queue.available.toLocaleString()}</Figure>,
  };
  const wideColumns: TableProps.ColumnDefinition<Queue>[] = [
    nameColumn,
    { id: "type", header: "Type", cell: queueTypeLabel },
    availableColumn,
    {
      id: "in-flight",
      header: <FigureHeader>In flight</FigureHeader>,
      sortingField: "inFlight",
      cell: (queue) => <Figure>{queue.inFlight.toLocaleString()}</Figure>,
    },
    { id: "created", header: "Created", cell: (queue) => formatDate(queue.created) },
  ];
  // Khung hẹp: tầng 2 là type · in flight, màu xám
  const compactColumns: TableProps.ColumnDefinition<Queue>[] = [
    {
      ...nameColumn,
      cell: (queue) => (
        <div>
          {nameLink(queue)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[queueTypeLabel(queue), `${queue.inFlight.toLocaleString()} in flight`].join(
              DETAIL_SEPARATOR,
            )}
          </Box>
        </div>
      ),
    },
    availableColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(queues),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create queue", primary: true, href: sqsRoutes.createQueue },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={queues.data ? `(${queues.data.length})` : undefined}
      description={`Queues hold messages until a consumer handles them. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Queues
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find queues by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<Queue>("queue", (item) => item.name)}
        trackBy={QUEUE_NAME_FIELD}
        items={items}
        loading={queues.isLoading}
        loadingText='Loading queues'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteQueuesModal
          queues={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
