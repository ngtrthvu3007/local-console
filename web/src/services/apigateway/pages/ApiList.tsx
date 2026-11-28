import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { errorMessage, formatDate } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { type ApiRow, apigatewayRoutes } from "@localconsole/core/apigateway";
import { DeleteApiModal } from "../components/DeleteApiModal.tsx";
import { useApis } from "../hooks/useApis.ts";
import { apigatewayBaseCrumbs } from "../routes.ts";

const NAME_FIELD = "name";
const PAGE_SIZE = 50;
// REST và HTTP có thể trùng id nên khóa chọn gồm cả version
const rowKey = (api: ApiRow) => `${api.version}/${api.id}`;

export function ApiList() {
  useBreadcrumbs(apigatewayBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const apis = useApis();
  const [deleting, setDeleting] = useState(false);

  const emptyState = emptyOrError(
    apis,
    <EmptyState title='No APIs' description={`You don't have any APIs in ${region}.`} />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<ApiRow>(apis.data?.rows ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: rowKey },
    });

  const selected = collectionProps.selectedItems?.[0];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<ApiRow> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: (api) => (
      <Link href={apigatewayRoutes.api(api.version, api.id)} onFollow={follow}>
        {api.name}
      </Link>
    ),
  };
  const typeColumn: TableProps.ColumnDefinition<ApiRow> = {
    id: "type",
    header: "Type",
    sortingField: "type",
    cell: (api) => api.type,
  };
  const wideColumns: TableProps.ColumnDefinition<ApiRow>[] = [
    nameColumn,
    typeColumn,
    { id: "id", header: "ID", cell: (api) => api.id },
    {
      id: "created",
      header: "Created",
      sortingField: "created",
      cell: (api) => formatDate(api.created),
    },
  ];
  const compactColumns = [nameColumn, typeColumn];

  const barActions: BarAction[] = [
    refreshAction(apis),
    { id: "delete", text: "Delete", disabled: !selected, onClick: () => setDeleting(true) },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={apis.data ? `(${apis.data.rows.length})` : undefined}
      description={`REST, HTTP and WebSocket APIs. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      APIs
    </Header>
  );

  return (
    <div ref={ref}>
      {apis.data?.failures.map(({ family, error }) => (
        <Alert key={family} type='error' header="Couldn't load some APIs">
          {family}: {errorMessage(error)}
        </Alert>
      ))}
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<ApiRow>("API", (item) => item.name)}
        trackBy={rowKey}
        items={items}
        loading={apis.isLoading}
        loadingText='Loading APIs'
        columnDefinitions={compact ? compactColumns : wideColumns}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find APIs by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && selected && (
        <DeleteApiModal api={selected} onDismiss={() => setDeleting(false)} onDone={finishDelete} />
      )}
    </div>
  );
}
