import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { UserPoolDescriptionType } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { CreatePoolModal } from "../components/CreatePoolModal.tsx";
import { DeletePoolsModal } from "../components/DeletePoolsModal.tsx";
import { useUserPools } from "../hooks/usePools.ts";
import { cognitoBaseCrumbs, cognitoRoutes } from "../routes.ts";

const POOL_ID_FIELD = "Id";
const POOL_NAME_FIELD = "Name";
const PAGE_SIZE = 50;

export function PoolList() {
  useBreadcrumbs(cognitoBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const pools = useUserPools();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const emptyState = emptyOrError(
    pools,
    <EmptyState
      title='No user pools'
      description='Create a user pool to add users and test sign-in.'
      action={<Button onClick={() => setCreating(true)}>Create user pool</Button>}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<UserPoolDescriptionType>(pools.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        fields: [POOL_NAME_FIELD],
      },
      sorting: { defaultState: { sortingColumn: { sortingField: POOL_NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: POOL_ID_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];

  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameLink = (pool: UserPoolDescriptionType) =>
    pool.Id ? (
      <Link href={cognitoRoutes.pool(pool.Id)} onFollow={follow}>
        {pool.Name}
      </Link>
    ) : (
      pool.Name
    );

  const nameColumn: TableProps.ColumnDefinition<UserPoolDescriptionType> = {
    id: "name",
    header: "Name",
    sortingField: POOL_NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };

  const wideColumns: TableProps.ColumnDefinition<UserPoolDescriptionType>[] = [
    nameColumn,
    {
      id: "id",
      header: "Pool ID",
      sortingField: POOL_ID_FIELD,
      cell: (pool) => pool.Id ?? NOT_AVAILABLE,
    },
    {
      id: "created",
      header: "Created",
      sortingField: "CreationDate",
      cell: (pool) => formatDate(pool.CreationDate),
    },
  ];

  // Khung hẹp: tầng 2 là Pool ID, màu xám
  const compactColumns: TableProps.ColumnDefinition<UserPoolDescriptionType>[] = [
    {
      ...nameColumn,
      cell: (pool) => (
        <div>
          {nameLink(pool)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {pool.Id ?? NOT_AVAILABLE}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(pools),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create user pool", primary: true, onClick: () => setCreating(true) },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={pools.data ? `(${pools.data.length})` : undefined}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      User pools
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find user pools by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<UserPoolDescriptionType>(
          "user pool",
          (item) => item.Name ?? "",
        )}
        trackBy={POOL_ID_FIELD}
        items={items}
        loading={pools.isLoading}
        loadingText='Loading user pools'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {creating && <CreatePoolModal onDismiss={() => setCreating(false)} />}
      {deleting && (
        <DeletePoolsModal
          pools={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
