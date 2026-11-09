import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import type { FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatDate } from "@shared/format.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DEFAULT_LOG_RANGE, LOG_RANGES, type LogRangeId } from "../constants.ts";
import { logMessageText } from "../helpers.ts";
import { useFunctionLogs } from "../hooks/useFunctionLogs.ts";

// Giữ nguyên xuống dòng của log (stack trace…), dòng dài thì xuống dòng thay vì cuộn ngang
const messageStyle = { whiteSpace: "pre-wrap", wordBreak: "break-word" } as const;

const RANGE_OPTIONS = LOG_RANGES.map((range) => ({ id: range.id, text: range.text }));

const timestampColumn: TableProps.ColumnDefinition<FilteredLogEvent> = {
  id: "timestamp",
  header: "Timestamp",
  cell: (event) => formatDate(event.timestamp),
};
const messageColumn: TableProps.ColumnDefinition<FilteredLogEvent> = {
  id: "message",
  header: "Message",
  isRowHeader: true,
  cell: (event) => (
    <div style={messageStyle}>
      <Box variant='code'>{logMessageText(event.message)}</Box>
    </div>
  ),
};
const streamColumn: TableProps.ColumnDefinition<FilteredLogEvent> = {
  id: "stream",
  header: "Log stream",
  cell: (event) => event.logStreamName,
};

const WIDE_COLUMNS = [timestampColumn, messageColumn, streamColumn];
const COMPACT_COLUMNS = [timestampColumn, messageColumn];

const eventId = (event: FilteredLogEvent) =>
  event.eventId ?? `${event.logStreamName}:${event.timestamp}:${event.message}`;

export function MonitorTab({ functionName, logGroup }: { functionName: string; logGroup: string }) {
  const { ref, compact } = useIsCompact();
  const [rangeId, setRangeId] = useState<LogRangeId>(DEFAULT_LOG_RANGE);
  const [filterText, setFilterText] = useState("");
  // Chỉ tải lại khi ngừng gõ, không gọi API theo từng phím
  const [filterPattern, setFilterPattern] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logs = useFunctionLogs(functionName, logGroup, { rangeId, filterPattern, autoRefresh });
  const events = logs.data ?? [];

  const headerActions = (
    <SpaceBetween direction='horizontal' size='m' alignItems='center'>
      <SegmentedControl
        label='Range'
        options={RANGE_OPTIONS}
        selectedId={rangeId}
        onChange={({ detail }) => setRangeId(detail.selectedId as LogRangeId)}
      />
      <Toggle checked={autoRefresh} onChange={({ detail }) => setAutoRefresh(detail.checked)}>
        Auto refresh
      </Toggle>
      {/* Tự làm mới thì không quay spinner mỗi 5 giây */}
      <Button
        iconName='refresh'
        ariaLabel='Refresh'
        loading={logs.isFetching && !autoRefresh}
        onClick={() => logs.refetch()}
      />
    </SpaceBetween>
  );

  const header = (
    <Header
      counter={logs.data ? `(${events.length})` : undefined}
      description={`Log group ${logGroup}`}
      actions={headerActions}
    >
      Log events
    </Header>
  );

  const filter = (
    <TextFilter
      filteringText={filterText}
      filteringPlaceholder='Filter events, e.g. ERROR'
      onChange={({ detail }) => setFilterText(detail.filteringText)}
      onDelayedChange={({ detail }) => setFilterPattern(detail.filteringText.trim())}
    />
  );

  const empty = emptyOrError(
    logs,
    <EmptyState
      title='No log events in this time range'
      description='Invoke the function from the Test tab, or trigger it from S3 or SQS.'
    />,
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        items={events}
        trackBy={eventId}
        loading={logs.isLoading}
        loadingText='Loading log events'
        columnDefinitions={compact ? COMPACT_COLUMNS : WIDE_COLUMNS}
        wrapLines
        cellVerticalAlign='top'
        empty={empty}
        header={header}
        filter={filter}
      />
    </div>
  );
}
