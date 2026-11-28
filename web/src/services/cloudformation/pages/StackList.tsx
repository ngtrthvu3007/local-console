import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { Stack } from "@aws-sdk/client-cloudformation";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteStackModal } from "../components/DeleteStackModal.tsx";
import { StackStatus } from "../components/StackStatus.tsx";
import { useStacks } from "../hooks/useStacks.ts";
import { cloudformationRoutes, stacksCrumbs } from "../routes.ts";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";

const NAME_FIELD = "StackName";

export function StackList() {
  useBreadcrumbs(stacksCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const stacks = useStacks();
  const [deleting, setDeleting] = useState(false);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Stack>(stacks.data ?? [], {
      filtering: {
        empty: emptyOrError(
          stacks,
          <EmptyState
            title='No stacks'
            description={`You don't have any stacks in ${region}. Deploy one with CDK or the AWS CLI, or create one here.`}
            action={
              <Button href={cloudformationRoutes.createStack} onFollow={follow}>
                Create stack
              </Button>
            }
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

  const selected = collectionProps.selectedItems?.[0];

  const columns: TableProps.ColumnDefinition<Stack>[] = [
    {
      id: "name",
      header: "Name",
      sortingField: NAME_FIELD,
      isRowHeader: true,
      cell: (stack) => (
        <Link href={cloudformationRoutes.stack(stack.StackName ?? "")} onFollow={follow}>
          {stack.StackName}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (stack) => <StackStatus status={stack.StackStatus} reason={stack.StackStatusReason} />,
    },
    {
      id: "created",
      header: "Created",
      sortingField: "CreationTime",
      cell: (stack) => formatDate(stack.CreationTime),
    },
    {
      id: "updated",
      header: "Updated",
      sortingField: "LastUpdatedTime",
      cell: (stack) => formatDate(stack.LastUpdatedTime),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(stacks),
    { id: "delete", text: "Delete", disabled: !selected, onClick: () => setDeleting(true) },
    { id: "create", text: "Create stack", primary: true, href: cloudformationRoutes.createStack },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={stacks.data ? `(${stacks.data.length})` : undefined}
      description='Stacks that CDK or the AWS CLI deployed to Floci: events, resources and outputs.'
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Stacks
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<Stack>("stack", (stack) => stack.StackName ?? "")}
        trackBy={NAME_FIELD}
        items={items}
        loading={stacks.isLoading}
        loadingText='Loading stacks'
        columnDefinitions={columns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find stacks by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && selected?.StackName && (
        <DeleteStackModal
          stack={selected.StackName}
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
