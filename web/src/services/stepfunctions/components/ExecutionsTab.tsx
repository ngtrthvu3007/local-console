import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { ExecutionListItem, ExecutionStatus } from "@aws-sdk/client-sfn";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EXECUTION_STATUS_FILTERS, STATUS_FILTER_ALL } from "../constants.ts";
import { useExecutionList } from "../hooks/useExecutions.ts";
import { stepfunctionsRoutes } from "../routes.ts";
import { formatElapsed } from "../steps.ts";
import { ExecutionStatus as StatusLabel } from "./ExecutionStatus.tsx";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [{ value: STATUS_FILTER_ALL, label: "All" }, ...EXECUTION_STATUS_FILTERS];

const elapsedOf = (execution: ExecutionListItem) =>
  execution.startDate && execution.stopDate
    ? formatElapsed(execution.stopDate.getTime() - execution.startDate.getTime())
    : formatElapsed();

export function ExecutionsTab({ machineArn }: { machineArn: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const [status, setStatus] = useState(STATUS_FILTER_ALL);
  const executions = useExecutionList(
    machineArn,
    status === STATUS_FILTER_ALL ? "" : (status as ExecutionStatus),
  );

  const { items, collectionProps, paginationProps } = useCollection<ExecutionListItem>(
    executions.data ?? [],
    {
      pagination: { pageSize: PAGE_SIZE },
    },
  );

  const nameLink = (execution: ExecutionListItem) => (
    <Link href={stepfunctionsRoutes.execution(execution.executionArn ?? "")} onFollow={follow}>
      {execution.name}
    </Link>
  );
  const wideColumns: TableProps.ColumnDefinition<ExecutionListItem>[] = [
    { id: "name", header: "Name", isRowHeader: true, cell: nameLink },
    { id: "status", header: "Status", cell: (item) => <StatusLabel status={item.status} /> },
    { id: "started", header: "Started", cell: (item) => formatDate(item.startDate) },
    { id: "duration", header: "Duration", cell: elapsedOf },
  ];
  // Khung hẹp: tầng 1 là tên + status, tầng 2 là thời điểm bắt đầu · thời gian chạy
  const compactColumns: TableProps.ColumnDefinition<ExecutionListItem>[] = [
    {
      id: "name",
      header: "Name",
      isRowHeader: true,
      cell: (item) => (
        <div>
          <SpaceBetween size='xs' direction='horizontal'>
            {nameLink(item)}
            <StatusLabel status={item.status} />
          </SpaceBetween>
          <Box variant='small' display='block' color='text-body-secondary'>
            {[formatDate(item.startDate), elapsedOf(item)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const header = (
    <Header
      counter={executions.data ? `(${executions.data.length})` : undefined}
      actions={<ActionBar compact={compact} actions={[refreshAction(executions)]} />}
    >
      Executions
    </Header>
  );

  // Ô lọc nằm ở khu filter của bảng như ô Event bus của Rules, không chen vào hàng nút của header
  const filter = (
    <FormField label='Status'>
      <Select
        selectedOption={STATUS_OPTIONS.find((option) => option.value === status) ?? null}
        options={STATUS_OPTIONS}
        onChange={({ detail }) => setStatus(detail.selectedOption.value ?? STATUS_FILTER_ALL)}
      />
    </FormField>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='container'
        trackBy='executionArn'
        items={items}
        loading={executions.isLoading}
        loadingText='Loading executions'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        empty={emptyOrError(
          executions,
          <EmptyState
            title='No executions'
            description={
              status === STATUS_FILTER_ALL
                ? "Use Start execution to see how it runs."
                : "No execution has this status."
            }
          />,
        )}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
    </div>
  );
}
