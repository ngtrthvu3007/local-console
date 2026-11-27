import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { ParameterMetadata } from "@aws-sdk/client-ssm";
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
import { DETAIL_SEPARATOR, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteParametersModal } from "../components/DeleteParametersModal.tsx";
import { useParameters } from "../hooks/useParameters.ts";
import { ssmBaseCrumbs, ssmRoutes } from "../routes.ts";

const NAME_FIELD = "Name";

const nameOf = (parameter: ParameterMetadata) => parameter.Name ?? "";

export function ParameterList() {
  useBreadcrumbs(ssmBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const parameters = useParameters();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={ssmRoutes.createParameter} onFollow={follow}>
      Create parameter
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<ParameterMetadata>(parameters.data ?? [], {
      filtering: {
        empty: emptyOrError(
          parameters,
          <EmptyState
            title='No parameters'
            description={`You don't have any parameters in ${region}.`}
            action={createButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        fields: [NAME_FIELD],
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];

  const nameLink = (parameter: ParameterMetadata) => (
    <Link href={ssmRoutes.parameter(nameOf(parameter))} onFollow={follow}>
      {nameOf(parameter)}
    </Link>
  );

  const nameColumn: TableProps.ColumnDefinition<ParameterMetadata> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };

  const wideColumns: TableProps.ColumnDefinition<ParameterMetadata>[] = [
    nameColumn,
    { id: "type", header: "Type", cell: (p) => p.Type },
    {
      id: "version",
      header: <FigureHeader>Version</FigureHeader>,
      cell: (p) => <Figure>{p.Version}</Figure>,
    },
    { id: "modified", header: "Last modified", cell: (p) => formatDate(p.LastModifiedDate) },
  ];

  // Khung hẹp: tầng 2 là type và ngày sửa, màu xám
  const compactColumns: TableProps.ColumnDefinition<ParameterMetadata>[] = [
    {
      ...nameColumn,
      cell: (parameter) => (
        <div>
          {nameLink(parameter)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[parameter.Type, formatDate(parameter.LastModifiedDate)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(parameters),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create parameter", primary: true, href: ssmRoutes.createParameter },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={parameters.data ? `(${parameters.data.length})` : undefined}
      description={`Configuration values your apps read at run time. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Parameters
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<ParameterMetadata>("parameter", nameOf)}
        trackBy={NAME_FIELD}
        items={items}
        loading={parameters.isLoading}
        loadingText='Loading parameters'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find parameters by name or path'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteParametersModal
          names={selected.map(nameOf)}
          onDismiss={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false);
            actions.setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
}
