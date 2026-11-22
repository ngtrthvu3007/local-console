import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useStateMachines } from "../hooks/useStateMachines.ts";
import { stateMachinesCrumbs, stepfunctionsRoutes } from "../routes.ts";
import type { StateMachine } from "../stateMachines.ts";
import { STATE_MACHINE_TYPE_LABELS } from "../constants.ts";

const NAME_FIELD = "name";
const PAGE_SIZE = 50;

export function StateMachineList() {
  useBreadcrumbs(stateMachinesCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const machines = useStateMachines();

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<StateMachine>(machines.data ?? [], {
      filtering: {
        empty: emptyOrError(
          machines,
          <EmptyState
            title='No state machines'
            description={`You don't have any state machines in ${region}. Deploy one with CDK or the AWS CLI.`}
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
      pagination: { pageSize: PAGE_SIZE },
    });

  const nameLink = (machine: StateMachine) => (
    <Link href={stepfunctionsRoutes.stateMachine(machine.name)} onFollow={follow}>
      {machine.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<StateMachine> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const wideColumns: TableProps.ColumnDefinition<StateMachine>[] = [
    nameColumn,
    { id: "type", header: "Type", cell: (machine) => STATE_MACHINE_TYPE_LABELS[machine.type] },
    {
      id: "created",
      header: "Created",
      sortingField: "createdAt",
      cell: (machine) => formatDate(machine.createdAt),
    },
  ];
  // Khung hẹp: tầng 1 là tên, tầng 2 là type · ngày tạo
  const compactColumns: TableProps.ColumnDefinition<StateMachine>[] = [
    {
      ...nameColumn,
      cell: (machine) => (
        <div>
          {nameLink(machine)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[STATE_MACHINE_TYPE_LABELS[machine.type], formatDate(machine.createdAt)].join(
              DETAIL_SEPARATOR,
            )}
          </Box>
        </div>
      ),
    },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={machines.data ? `(${machines.data.length})` : undefined}
      description='Workflows deployed to Floci. Start an execution and follow it step by step.'
      actions={<ActionBar compact={compact} actions={[refreshAction(machines)]} />}
    >
      State machines
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        trackBy={NAME_FIELD}
        items={items}
        loading={machines.isLoading}
        loadingText='Loading state machines'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find state machines by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
    </div>
  );
}
