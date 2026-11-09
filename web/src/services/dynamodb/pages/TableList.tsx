import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeleteTablesModal } from "../components/DeleteTablesModal.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { KeyLabel, keyText } from "../components/KeyLabel.tsx";
import { TABLE_STATUS_ACTIVE } from "../constants.ts";
import { indexCountOf, keySchemaOf, useTables } from "../hooks/useTables.ts";
import { dynamodbBaseCrumbs, dynamodbRoutes } from "../routes.ts";

const TABLE_NAME_FIELD = "TableName";
const PAGE_SIZE = 50;

const itemCountText = (table: TableDescription) => (table.ItemCount ?? 0).toLocaleString();

// Chỉ hiện trạng thái khi bảng chưa sẵn sàng; tô xanh "Active" ở mọi dòng chỉ gây nhiễu
function TableName({
  table,
  follow,
}: {
  table: TableDescription;
  follow: ReturnType<typeof useFollow>;
}) {
  const link = (
    <Link href={dynamodbRoutes.table(table.TableName!)} onFollow={follow}>
      {table.TableName}
    </Link>
  );
  if (table.TableStatus === TABLE_STATUS_ACTIVE) return link;
  return (
    <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
      {link}
      <StatusIndicator type='in-progress'>{table.TableStatus}</StatusIndicator>
    </SpaceBetween>
  );
}

// Khung hẹp: tầng 2 là key và số index, màu xám
function compactDetails(table: TableDescription) {
  const keys = keySchemaOf(table);
  const indexCount = indexCountOf(table);
  return [
    keyText(keys.partitionKey),
    keys.sortKey && keyText(keys.sortKey),
    indexCount > 0 && pluralize(indexCount, "index", "indexes"),
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
}

export function TableList() {
  useBreadcrumbs(dynamodbBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const tables = useTables();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={dynamodbRoutes.createTable} onFollow={follow}>
      Create table
    </Button>
  );

  const emptyState = emptyOrError(
    tables,
    <EmptyState
      title='No tables'
      description={`You don't have any tables in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<TableDescription>(tables.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: TABLE_NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: TABLE_NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<TableDescription> = {
    id: "name",
    header: "Name",
    sortingField: TABLE_NAME_FIELD,
    isRowHeader: true,
    cell: (table) => <TableName table={table} follow={follow} />,
  };
  const itemsColumn: TableProps.ColumnDefinition<TableDescription> = {
    id: "items",
    header: <FigureHeader>Items</FigureHeader>,
    sortingField: "ItemCount",
    cell: (table) => <Figure>{itemCountText(table)}</Figure>,
  };
  const wideColumns: TableProps.ColumnDefinition<TableDescription>[] = [
    nameColumn,
    {
      id: "partition-key",
      header: "Partition key",
      cell: (table) => <KeyLabel attribute={keySchemaOf(table).partitionKey} />,
    },
    {
      id: "sort-key",
      header: "Sort key",
      cell: (table) => <KeyLabel attribute={keySchemaOf(table).sortKey} />,
    },
    {
      id: "indexes",
      header: <FigureHeader>Indexes</FigureHeader>,
      cell: (table) => <Figure>{indexCountOf(table)}</Figure>,
    },
    itemsColumn,
  ];
  const compactColumns: TableProps.ColumnDefinition<TableDescription>[] = [
    {
      ...nameColumn,
      cell: (table) => (
        <div>
          <TableName table={table} follow={follow} />
          <Box variant='small' display='block' color='text-body-secondary'>
            {compactDetails(table)}
          </Box>
        </div>
      ),
    },
    itemsColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(tables),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create table", primary: true, href: dynamodbRoutes.createTable },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={tables.data ? `(${tables.data.length})` : undefined}
      description={`Tables hold your items. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Tables
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find tables by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        trackBy={TABLE_NAME_FIELD}
        items={items}
        loading={tables.isLoading}
        loadingText='Loading tables'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteTablesModal
          tables={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
