import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatBytes, formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeleteFunctionsModal } from "../components/FunctionModals.tsx";
import { MEGABYTE_UNIT } from "../constants.ts";
import { logGroupOf } from "../helpers.ts";
import { useFunctions } from "../hooks/useFunctions.ts";
import { lambdaBaseCrumbs, lambdaRoutes } from "../routes.ts";

const FUNCTION_NAME_FIELD = "FunctionName";
const PAGE_SIZE = 50;

export function FunctionList() {
  useBreadcrumbs(lambdaBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const functions = useFunctions();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={lambdaRoutes.createFunction} onFollow={follow}>
      Create function
    </Button>
  );

  const emptyState = emptyOrError(
    functions,
    <EmptyState
      title='No functions'
      description={`You don't have any functions in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<FunctionConfiguration>(functions.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: FUNCTION_NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: FUNCTION_NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<FunctionConfiguration> = {
    id: "name",
    header: "Function name",
    sortingField: FUNCTION_NAME_FIELD,
    isRowHeader: true,
    cell: (item) => (
      <Link href={lambdaRoutes.function(item.FunctionName!)} onFollow={follow}>
        {item.FunctionName}
      </Link>
    ),
  };
  const runtimeColumn: TableProps.ColumnDefinition<FunctionConfiguration> = {
    id: "runtime",
    header: "Runtime",
    sortingField: "Runtime",
    cell: (item) => item.Runtime,
  };
  const otherColumns: TableProps.ColumnDefinition<FunctionConfiguration>[] = [
    {
      id: "code-size",
      header: "Code size",
      sortingField: "CodeSize",
      cell: (item) => formatBytes(item.CodeSize),
    },
    {
      id: "memory",
      header: "Memory",
      sortingField: "MemorySize",
      cell: (item) => `${item.MemorySize} ${MEGABYTE_UNIT}`,
    },
    {
      id: "modified",
      header: "Last modified",
      sortingField: "LastModified",
      cell: (item) => formatDate(item.LastModified),
    },
  ];
  // Khung hẹp chỉ giữ tên và runtime
  const columns = compact
    ? [nameColumn, runtimeColumn]
    : [nameColumn, runtimeColumn, ...otherColumns];

  const barActions: BarAction[] = [
    refreshAction(functions),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create function", primary: true, href: lambdaRoutes.createFunction },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={functions.data ? `(${functions.data.length})` : undefined}
      description={`Functions run your code when they are invoked or triggered. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Functions
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find functions by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  const functionsToDelete = selected.map((item) => ({
    name: item.FunctionName!,
    logGroup: logGroupOf(item),
  }));

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        trackBy={FUNCTION_NAME_FIELD}
        items={items}
        loading={functions.isLoading}
        loadingText='Loading functions'
        columnDefinitions={columns}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteFunctionsModal
          functions={functionsToDelete}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
