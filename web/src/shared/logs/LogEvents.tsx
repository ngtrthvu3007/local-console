import { useState, type ReactNode } from "react";
import type { FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import { ResponsiveActions } from "../components/ResponsiveActions.tsx";
import Table, { type TableProps } from "../components/ResponsiveTable.tsx";
import { emptyOrError } from "../components/TableStates.tsx";
import { useFollow } from "../hooks/useFollow.ts";
import { useIsCompact } from "../hooks/useIsCompact.ts";
import { DEFAULT_LOG_RANGE, LOG_RANGES, type LogRangeId } from "@localconsole/core/logs";
import { logEventColumns } from "./columns.tsx";
import { useLogEvents } from "./useLogEvents.ts";

const RANGE_OPTIONS = LOG_RANGES.map((range) => ({ id: range.id, text: range.text }));

const eventId = (event: FilteredLogEvent) =>
  event.eventId ?? `${event.logStreamName}:${event.timestamp}:${event.message}`;

interface Props {
  logGroupName: string;
  title: string;
  description?: ReactNode;
  filterPlaceholder: string;
  empty: ReactNode;
  streamHref?: (stream: string) => string;
  actions?: ReactNode; // vd: link View in CloudWatch Logs của Lambda › Monitor
}

export function LogEvents({
  logGroupName,
  title,
  description,
  filterPlaceholder,
  empty,
  streamHref,
  actions,
}: Props) {
  const { ref, compact } = useIsCompact();
  const follow = useFollow();
  const [rangeId, setRangeId] = useState<LogRangeId>(DEFAULT_LOG_RANGE);
  const [filterText, setFilterText] = useState("");
  // Chỉ tải lại khi ngừng gõ, không gọi API theo từng phím
  const [filterPattern, setFilterPattern] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logs = useLogEvents(logGroupName, { rangeId, filterPattern, autoRefresh });
  const events = logs.data ?? [];

  const streamColumn: TableProps.ColumnDefinition<FilteredLogEvent> = {
    id: "stream",
    header: "Log stream",
    cell: ({ logStreamName }) =>
      streamHref && logStreamName ? (
        <Link href={streamHref(logStreamName)} onFollow={follow}>
          {logStreamName}
        </Link>
      ) : (
        logStreamName
      ),
  };

  const headerActions = (
    <ResponsiveActions>
      {actions}
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
    </ResponsiveActions>
  );

  const header = (
    <Header
      counter={logs.data ? `(${events.length})` : undefined}
      description={description}
      actions={headerActions}
    >
      {title}
    </Header>
  );

  const filter = (
    <TextFilter
      filteringText={filterText}
      filteringPlaceholder={filterPlaceholder}
      onChange={({ detail }) => setFilterText(detail.filteringText)}
      onDelayedChange={({ detail }) => setFilterPattern(detail.filteringText.trim())}
    />
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        items={events}
        trackBy={eventId}
        loading={logs.isLoading}
        loadingText='Loading log events'
        columnDefinitions={compact ? logEventColumns : [...logEventColumns, streamColumn]}
        wrapLines
        cellVerticalAlign='top'
        empty={emptyOrError(logs, empty)}
        header={header}
        filter={filter}
      />
    </div>
  );
}
