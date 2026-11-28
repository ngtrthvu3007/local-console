import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, pluralize } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteStreamsModal } from "../components/DeleteStreamsModal.tsx";
import { useStreams, type StreamRow } from "../hooks/useStreams.ts";
import { streamModeLabel, kinesisRoutes } from "@localconsole/core/kinesis";
import { kinesisBaseCrumbs } from "../routes.ts";
import { STREAM_STATUS_STYLES } from "../constants.ts";

const NAME_FIELD = "name";

const openShardsText = (stream: StreamRow) =>
  stream.openShards === undefined ? NOT_AVAILABLE : pluralize(stream.openShards, "open shard");

export function StreamList() {
  useBreadcrumbs(kinesisBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const streams = useStreams();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={kinesisRoutes.createStream} onFollow={follow}>
      Create data stream
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<StreamRow>(streams.data ?? [], {
      filtering: {
        empty: emptyOrError(
          streams,
          <EmptyState
            title='No data streams'
            description={`You don't have any data streams in ${region}.`}
            action={createButton}
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
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameLink = (stream: StreamRow) => (
    <Link href={kinesisRoutes.stream(stream.name)} onFollow={follow}>
      {stream.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<StreamRow> = {
    id: "name",
    header: "Data stream name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const statusColumn: TableProps.ColumnDefinition<StreamRow> = {
    id: "status",
    header: "Status",
    cell: (stream) => <StatusBadge status={stream.status} styles={STREAM_STATUS_STYLES} />,
  };

  const wideColumns: TableProps.ColumnDefinition<StreamRow>[] = [
    nameColumn,
    statusColumn,
    { id: "mode", header: "Capacity mode", cell: (stream) => streamModeLabel(stream.mode) },
    {
      id: "shards",
      header: <FigureHeader>Open shards</FigureHeader>,
      sortingField: "openShards",
      cell: (stream) => <Figure>{stream.openShards ?? NOT_AVAILABLE}</Figure>,
    },
  ];
  // Khung hẹp: tầng 2 là capacity mode · số shard, màu xám
  const compactColumns: TableProps.ColumnDefinition<StreamRow>[] = [
    {
      ...nameColumn,
      cell: (stream) => (
        <div>
          {nameLink(stream)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[streamModeLabel(stream.mode), openShardsText(stream)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(streams),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create data stream", primary: true, href: kinesisRoutes.createStream },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={streams.data ? `(${streams.data.length})` : undefined}
      description={`Data streams keep records in order per shard for your consumers. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Data streams
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<StreamRow>("data stream", (item) => item.name)}
        trackBy={NAME_FIELD}
        items={items}
        loading={streams.isLoading}
        loadingText='Loading data streams'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find data streams by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteStreamsModal
          streams={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
