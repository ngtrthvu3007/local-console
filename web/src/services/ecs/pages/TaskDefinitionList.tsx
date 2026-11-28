import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { REVISION_STATUS_STYLES, STATUS } from "../constants.ts";
import { useFamilies, type FamilyStatus } from "../hooks/useTaskDefinitions.ts";
import { ecsRoutes, ecsTaskDefinitionCrumbs } from "../routes.ts";

interface FamilyRow {
  family: string;
}

const STATUS_OPTIONS: { id: FamilyStatus; text: string }[] = [
  { id: STATUS.active, text: REVISION_STATUS_STYLES.ACTIVE.label },
  { id: STATUS.inactive, text: REVISION_STATUS_STYLES.INACTIVE.label },
];

export function TaskDefinitionList() {
  useBreadcrumbs(ecsTaskDefinitionCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const [status, setStatus] = useState<FamilyStatus>(STATUS.active);
  const families = useFamilies(status);
  const rows = (families.data ?? []).map((family) => ({ family }));

  const createButton = (
    <Button href={ecsRoutes.createTaskDefinition()} onFollow={follow}>
      Create new task definition
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<FamilyRow>(rows, {
      filtering: {
        empty: emptyOrError(
          families,
          <EmptyState
            title={
              status === STATUS.active ? "No task definitions" : "No inactive task definitions"
            }
            description='A task definition says which containers a task runs.'
            action={status === STATUS.active ? createButton : undefined}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: "family" } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
    });

  const columns: TableProps.ColumnDefinition<FamilyRow>[] = [
    {
      id: "family",
      header: "Family",
      sortingField: "family",
      isRowHeader: true,
      cell: (row) => (
        <Link href={ecsRoutes.family(row.family)} onFollow={follow}>
          {row.family}
        </Link>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(families),
    {
      id: "create",
      text: "Create new task definition",
      primary: true,
      href: ecsRoutes.createTaskDefinition(),
    },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        items={items}
        loading={families.isLoading}
        loadingText='Loading task definitions'
        columnDefinitions={columns}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={families.data ? `(${families.data.length})` : undefined}
            description='Each family keeps its revisions; tasks and services run one revision.'
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Task definitions
          </Header>
        }
        filter={
          <ResponsiveActions>
            <TextFilter
              {...filterProps}
              filteringPlaceholder='Find task definitions by family'
              countText={`${filteredItemsCount ?? 0} matches`}
            />
            <SegmentedControl
              label='Status'
              selectedId={status}
              options={STATUS_OPTIONS}
              onChange={({ detail }) =>
                setStatus(detail.selectedId === STATUS.inactive ? STATUS.inactive : STATUS.active)
              }
            />
          </ResponsiveActions>
        }
        pagination={<Pagination {...paginationProps} />}
      />
    </div>
  );
}
