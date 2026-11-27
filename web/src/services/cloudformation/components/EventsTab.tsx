import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { StackEvent } from "@aws-sdk/client-cloudformation";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, formatDateMs } from "@localconsole/core/shared";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  NESTED_STACK_TYPE,
  stackNameOfArn,
  isFailed,
  needsTls,
  cloudformationRoutes,
} from "@localconsole/core/cloudformation";
import { TLS_HINT } from "../constants.ts";
import { useStackEvents } from "../hooks/useStacks.ts";
import { StackStatus } from "./StackStatus.tsx";

const PAGE_SIZE = 100;

export function EventsTab({ stack, running }: { stack: string; running: boolean }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const events = useStackEvents(stack, running);
  const [failuresOnly, setFailuresOnly] = useState(false);

  const shown = (events.data ?? []).filter(
    (event) => !failuresOnly || isFailed(event.ResourceStatus),
  );
  // Không sort: nhiều event cùng mili giây
  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount } =
    useCollection<StackEvent>(shown, {
      filtering: {
        empty: emptyOrError(events, <EmptyState title='No events' />),
        noMatch: <EmptyState title='No matches' />,
      },
      pagination: { pageSize: PAGE_SIZE },
    });

  const logicalId = (event: StackEvent) => {
    const child =
      event.ResourceType === NESTED_STACK_TYPE && event.PhysicalResourceId
        ? stackNameOfArn(event.PhysicalResourceId)
        : undefined;
    // Event của chính stack cũng mang type Stack
    if (!child || child === stack) return event.LogicalResourceId;
    // Nguyên nhân gốc nằm trong events của stack con
    return (
      <Link href={cloudformationRoutes.stack(child)} onFollow={follow}>
        {event.LogicalResourceId}
      </Link>
    );
  };

  const columns: TableProps.ColumnDefinition<StackEvent>[] = [
    {
      id: "time",
      header: "Timestamp",
      cell: (event) => <span className='cfn-nowrap'>{formatDateMs(event.Timestamp)}</span>,
    },
    { id: "logical", header: "Logical ID", isRowHeader: true, cell: logicalId },
    {
      id: "status",
      header: "Status",
      cell: (event) => (
        <div>
          <StackStatus status={event.ResourceStatus} reason={event.ResourceStatusReason} />
          {needsTls(event.ResourceStatusReason) && (
            <Box variant='small' color='text-status-warning'>
              {TLS_HINT}
            </Box>
          )}
        </div>
      ),
    },
    { id: "type", header: "Type", cell: (event) => event.ResourceType ?? NOT_AVAILABLE },
  ];

  const header = (
    <Header
      counter={events.data ? `(${shown.length})` : undefined}
      actions={<ActionBar compact={compact} actions={[refreshAction(events)]} />}
    >
      Events
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='container'
        items={items}
        loading={events.isLoading}
        loadingText='Loading events'
        columnDefinitions={columns}
        wrapLines
        header={header}
        filter={
          <SpaceBetween size='s' direction={compact ? "vertical" : "horizontal"}>
            <TextFilter
              {...filterProps}
              filteringPlaceholder='Find events'
              countText={`${filteredItemsCount ?? 0} matches`}
            />
            <Toggle
              checked={failuresOnly}
              onChange={({ detail }) => setFailuresOnly(detail.checked)}
            >
              Failures only
            </Toggle>
          </SpaceBetween>
        }
        pagination={<Pagination {...paginationProps} />}
      />
    </div>
  );
}
