import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteTopicsModal } from "../components/DeleteTopicsModal.tsx";
import { useTopics } from "../hooks/useTopics.ts";
import { snsBaseCrumbs, snsRoutes } from "../routes.ts";
import { topicTypeLabel, type Topic } from "../topics.ts";

const TOPIC_NAME_FIELD = "name";
const PAGE_SIZE = 50;

export function TopicList() {
  useBreadcrumbs(snsBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const topics = useTopics();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={snsRoutes.createTopic} onFollow={follow}>
      Create topic
    </Button>
  );

  const emptyState = emptyOrError(
    topics,
    <EmptyState
      title='No topics'
      description={`You don't have any topics in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Topic>(topics.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: TOPIC_NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: TOPIC_NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameLink = (topic: Topic) => (
    <Link href={snsRoutes.topic(topic.name)} onFollow={follow}>
      {topic.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<Topic> = {
    id: "name",
    header: "Name",
    sortingField: TOPIC_NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const subscriptionsColumn: TableProps.ColumnDefinition<Topic> = {
    id: "subscriptions",
    header: <FigureHeader>Subscriptions</FigureHeader>,
    sortingField: "subscriptions",
    cell: (topic) => <Figure>{topic.subscriptions.toLocaleString()}</Figure>,
  };
  const wideColumns: TableProps.ColumnDefinition<Topic>[] = [
    nameColumn,
    { id: "type", header: "Type", cell: topicTypeLabel },
    subscriptionsColumn,
  ];
  // Khung hẹp: tầng 2 là type, màu xám
  const compactColumns: TableProps.ColumnDefinition<Topic>[] = [
    {
      ...nameColumn,
      cell: (topic) => (
        <div>
          {nameLink(topic)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[topicTypeLabel(topic), pluralize(topic.subscriptions, "subscription")].join(
              DETAIL_SEPARATOR,
            )}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(topics),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create topic", primary: true, href: snsRoutes.createTopic },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={topics.data ? `(${topics.data.length})` : undefined}
      description={`Topics fan messages out to queues, functions and HTTP endpoints. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Topics
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find topics by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<Topic>("topic", (item) => item.name)}
        trackBy={TOPIC_NAME_FIELD}
        items={items}
        loading={topics.isLoading}
        loadingText='Loading topics'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteTopicsModal
          topics={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
