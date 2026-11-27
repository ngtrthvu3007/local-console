import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError, type FailableQuery } from "@shared/components/TableStates.tsx";
import {
  DETAIL_SEPARATOR,
  NOT_AVAILABLE,
  formatDate,
  reformatJson,
} from "@localconsole/core/shared";
import { ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { formatElapsed, type StepRow, SEARCH_PARAMS } from "@localconsole/core/stepfunctions";
import { COLLAPSE_CHILDREN_LIMIT, STEP_STATUS_STYLES, TRUNCATED_NOTE } from "../constants.ts";
import { StepStatusIndicator } from "./ExecutionStatus.tsx";
import { TaskResourceLink } from "./TaskResourceLink.tsx";

const flatten = (rows: StepRow[]): StepRow[] =>
  rows.flatMap((row) => [row, ...flatten(row.children)]);

// Panel chi tiết của một bước: input, output, lỗi
function StepDetails({ step }: { step: StepRow }) {
  return (
    <SpaceBetween size='l'>
      {step.error && (
        <SpaceBetween size='s'>
          <Header variant='h3'>Error</Header>
          <CodeSnippet code={[step.error, step.cause].filter(Boolean).join("\n")} wrap />
        </SpaceBetween>
      )}
      <SpaceBetween size='s'>
        <Header variant='h3'>Input</Header>
        <CodeSnippet
          code={step.input === undefined ? NOT_AVAILABLE : reformatJson(step.input)}
          highlight={jsonHighlight}
          wrap
        />
        {step.inputTruncated && <Box color='text-body-secondary'>{TRUNCATED_NOTE}</Box>}
      </SpaceBetween>
      <SpaceBetween size='s'>
        <Header variant='h3'>Output</Header>
        <CodeSnippet
          code={step.output === undefined ? NOT_AVAILABLE : reformatJson(step.output)}
          highlight={jsonHighlight}
          wrap
        />
        {step.outputTruncated && <Box color='text-body-secondary'>{TRUNCATED_NOTE}</Box>}
      </SpaceBetween>
    </SpaceBetween>
  );
}

interface Props {
  steps: StepRow[];
  query: FailableQuery & { isFetching: boolean; isLoading: boolean };
}

export function StepsTable({ steps, query }: Props) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Chọn tay của người dùng; chưa chọn thì dòng gom quá lớn (Map hàng trăm vòng) gập sẵn
  const [expandedByUser, setExpandedByUser] = useState<Readonly<Record<string, boolean>>>({});
  const all = flatten(steps);
  const openId = searchParams.get(SEARCH_PARAMS.step) ?? undefined;
  const openStep = all.find((step) => step.openable && step.id === openId);

  // Mở từ trạng thái đóng thì thêm vào lịch sử, đổi bước khi đang mở thì thay: Back luôn đóng panel
  const stepHref = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.step, id);
    return `?${next}`;
  };
  const closeStep = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SEARCH_PARAMS.step);
        return next;
      },
      { replace: true },
    );

  useSplitPanel(
    openStep
      ? {
          header: openStep.name,
          description: [
            openStep.type,
            STEP_STATUS_STYLES[openStep.status].label,
            formatElapsed(openStep.durationMs),
          ].join(DETAIL_SEPARATOR),
          onClose: closeStep,
          body: <StepDetails step={openStep} />,
        }
      : null,
  );

  const nameCell = (step: StepRow) =>
    step.openable ? (
      <Link
        href={stepHref(step.id)}
        onFollow={(event) => {
          event.preventDefault();
          navigate(stepHref(step.id), { replace: Boolean(openId) });
        }}
      >
        {step.id === openId ? <strong>{step.name}</strong> : step.name}
      </Link>
    ) : (
      // Phần tử, không phải chữ trần: SpaceBetween của khung hẹp cần key của con
      <span>{step.name}</span>
    );
  const resourceCell = (step: StepRow) =>
    step.resource ? <TaskResourceLink resource={step.resource} /> : NOT_AVAILABLE;
  const startedCell = (step: StepRow) => formatDate(step.startedAt);

  const wideColumns: TableProps.ColumnDefinition<StepRow>[] = [
    { id: "name", header: "Step", isRowHeader: true, cell: nameCell },
    { id: "type", header: "Type", cell: (step) => step.type },
    {
      id: "status",
      header: "Status",
      cell: (step) => <StepStatusIndicator status={step.status} />,
    },
    { id: "started", header: "Started", cell: startedCell },
    { id: "duration", header: "Duration", cell: (step) => formatElapsed(step.durationMs) },
    { id: "resource", header: "Resource", cell: resourceCell },
  ];
  // Khung hẹp: tầng 1 là tên + status, tầng 2 là type · thời gian · resource
  const compactColumns: TableProps.ColumnDefinition<StepRow>[] = [
    {
      id: "name",
      header: "Step",
      isRowHeader: true,
      cell: (step) => (
        <div>
          <SpaceBetween size='xs' direction='horizontal'>
            {nameCell(step)}
            <StepStatusIndicator status={step.status} />
          </SpaceBetween>
          <Box variant='small' display='block' color='text-body-secondary'>
            {[step.type, formatElapsed(step.durationMs)].join(DETAIL_SEPARATOR)}
          </Box>
          {step.resource && (
            <Box variant='small' display='block'>
              {resourceCell(step)}
            </Box>
          )}
        </div>
      ),
    },
  ];

  const isExpandable = (step: StepRow) => step.children.length > 0;
  const expandedItems = all.filter(
    (step) =>
      isExpandable(step) &&
      (expandedByUser[step.id] ?? step.children.length <= COLLAPSE_CHILDREN_LIMIT),
  );

  const header = (
    <Header
      counter={query.isLoading ? undefined : `(${all.filter((step) => step.openable).length})`}
      actions={<ActionBar compact={compact} actions={[refreshAction(query)]} />}
    >
      Steps
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        trackBy='id'
        items={steps}
        loading={query.isLoading}
        loadingText='Loading steps'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        expandableRows={{
          getItemChildren: (step) => step.children,
          isItemExpandable: isExpandable,
          expandedItems,
          onExpandableItemToggle: ({ detail }) =>
            setExpandedByUser((current) => ({ ...current, [detail.item.id]: detail.expanded })),
        }}
        empty={emptyOrError(query, <EmptyState title='No steps yet' />)}
        header={header}
      />
    </div>
  );
}
