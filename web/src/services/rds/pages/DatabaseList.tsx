import { useCollection } from "@cloudscape-design/collection-hooks";
import type { DBInstance } from "@aws-sdk/client-rds";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useDatabaseActions } from "../components/DatabaseActions.tsx";
import { DatabaseStatus } from "../components/DatabaseStatus.tsx";
import { engineText } from "../databases.ts";
import { useDatabases } from "../hooks/useDatabases.ts";
import { rdsBaseCrumbs, rdsRoutes } from "../routes.ts";

const ID_FIELD = "DBInstanceIdentifier";
const PAGE_SIZE = 50;

const idOf = (database: DBInstance) => database.DBInstanceIdentifier ?? "";

export function DatabaseList() {
  useBreadcrumbs(rdsBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const databases = useDatabases();

  const createButton = (
    <Button variant='primary' href={rdsRoutes.createDatabase} onFollow={follow}>
      Create database
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<DBInstance>(databases.data ?? [], {
      filtering: {
        empty: emptyOrError(
          databases,
          <EmptyState
            title='No databases'
            description='Create a database with CDK or your IaC, then refresh.'
            action={createButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        fields: [ID_FIELD],
      },
      sorting: { defaultState: { sortingColumn: { sortingField: ID_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  // Lấy bản mới nhất của dòng đang chọn: selectedItems giữ status cũ, menu sẽ khóa sai sau Stop / Start
  const selectedId = collectionProps.selectedItems?.[0]?.DBInstanceIdentifier;
  const selected = databases.data?.find((database) => idOf(database) === selectedId);
  const databaseActions = useDatabaseActions(selected, () => actions.setSelectedItems([]));

  const idLink = (database: DBInstance) => (
    <Link href={rdsRoutes.database(idOf(database))} onFollow={follow}>
      {idOf(database)}
    </Link>
  );

  const idColumn: TableProps.ColumnDefinition<DBInstance> = {
    id: "id",
    header: "DB identifier",
    sortingField: ID_FIELD,
    isRowHeader: true,
    cell: idLink,
  };
  const statusColumn: TableProps.ColumnDefinition<DBInstance> = {
    id: "status",
    header: "Status",
    cell: (database) => <DatabaseStatus database={database} />,
  };

  const wideColumns: TableProps.ColumnDefinition<DBInstance>[] = [
    idColumn,
    { id: "engine", header: "Engine", cell: engineText },
    statusColumn,
    { id: "size", header: "Size", cell: (database) => database.DBInstanceClass ?? NOT_AVAILABLE },
  ];

  // Khung hẹp: tầng 2 là engine và size, màu xám
  const compactColumns: TableProps.ColumnDefinition<DBInstance>[] = [
    {
      ...idColumn,
      cell: (database) => (
        <div>
          {idLink(database)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[engineText(database), database.DBInstanceClass]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(databases),
    { id: "create", text: "Create database", primary: true, href: rdsRoutes.createDatabase },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={databases.data ? `(${databases.data.length})` : undefined}
      description={`PostgreSQL and MySQL databases running in Floci. Region: ${region}.`}
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={databaseActions.menuItems}
          onMenuItemClick={databaseActions.onMenuItemClick}
        />
      }
    >
      Databases
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<DBInstance>("database", idOf)}
        trackBy={ID_FIELD}
        items={items}
        loading={databases.isLoading}
        loadingText='Loading databases'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find databases by identifier'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {databaseActions.modal}
    </div>
  );
}
