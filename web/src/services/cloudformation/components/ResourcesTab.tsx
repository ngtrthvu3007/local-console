import { useMemo } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { StackResourceSummary } from "@aws-sdk/client-cloudformation";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Popover from "@cloudscape-design/components/popover";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TextFilter from "@cloudscape-design/components/text-filter";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  CDK_METADATA_TYPE,
  resourceHref,
  statusGroup,
  isStubReason,
  latestReasons,
} from "@localconsole/core/cloudformation";
import { useStackEvents, useStackResources } from "../hooks/useStacks.ts";
import "./StackStatus.css";

const PAGE_SIZE = 100;

// Physical ID có link khi khớp route trang service (spec 3.10)
export function PhysicalIdLink({ type = "", id }: { type?: string; id: string }) {
  const follow = useFollow();
  const href = resourceHref(type, id);

  return href ? (
    <Link href={href} onFollow={follow}>
      <BreakableText text={id} />
    </Link>
  ) : (
    <BreakableText text={id} />
  );
}

export function ResourcesTab({ stack, running }: { stack: string; running: boolean }) {
  const { ref, compact } = useIsCompact();
  const resources = useStackResources(stack, running);
  const events = useStackEvents(stack, running);
  // List của Floci không có lý do: lấy từ events
  const reasons = useMemo(() => latestReasons(events.data ?? []), [events.data]);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount } =
    useCollection<StackResourceSummary>(resources.data ?? [], {
      filtering: {
        empty: emptyOrError(resources, <EmptyState title='No resources' />),
        noMatch: <EmptyState title='No matches' />,
      },
      pagination: { pageSize: PAGE_SIZE },
    });

  const physicalId = (resource: StackResourceSummary) => {
    const id = resource.PhysicalResourceId;
    if (!id) return NOT_AVAILABLE;
    if (isStubReason(reasons.get(resource.LogicalResourceId ?? ""))) {
      // Stub: Floci không tạo gì nên không link
      return (
        <span>
          <BreakableText text={id} /> <Badge color='severity-medium'>Stubbed by Floci</Badge>
        </span>
      );
    }
    return <PhysicalIdLink type={resource.ResourceType} id={id} />;
  };

  const status = (resource: StackResourceSummary) => {
    const reason = reasons.get(resource.LogicalResourceId ?? "");
    return (
      <span className='cfn-nowrap'>
        <StatusIndicator type={statusGroup(resource.ResourceStatus)}>
          {reason ? (
            <Popover
              size='large'
              triggerType='text'
              content={<Box>{reason}</Box>}
              dismissButton={false}
            >
              {resource.ResourceStatus}
            </Popover>
          ) : (
            resource.ResourceStatus
          )}
        </StatusIndicator>
      </span>
    );
  };

  const columns: TableProps.ColumnDefinition<StackResourceSummary>[] = [
    { id: "logical", header: "Logical ID", isRowHeader: true, cell: (r) => r.LogicalResourceId },
    { id: "physical", header: "Physical ID", cell: physicalId },
    {
      id: "type",
      header: "Type",
      cell: (r) =>
        r.ResourceType === CDK_METADATA_TYPE ? (
          <Box color='text-status-inactive'>{r.ResourceType}</Box>
        ) : (
          r.ResourceType
        ),
    },
    { id: "status", header: "Status", cell: status },
  ];

  const header = (
    <Header
      counter={resources.data ? `(${resources.data.length})` : undefined}
      actions={<ActionBar compact={compact} actions={[refreshAction(resources)]} />}
    >
      Resources
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='container'
        trackBy='LogicalResourceId'
        items={items}
        loading={resources.isLoading}
        loadingText='Loading resources'
        columnDefinitions={columns}
        wrapLines
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find resources'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
    </div>
  );
}
