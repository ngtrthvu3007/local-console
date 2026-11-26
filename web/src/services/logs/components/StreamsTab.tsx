import { useCollection } from "@cloudscape-design/collection-hooks";
import type { LogStream } from "@aws-sdk/client-cloudwatch-logs";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useLogStreams } from "../hooks/useLogStreams.ts";
import { logsRoutes } from "../routes.ts";

export function StreamsTab({ group }: { group: string }) {
  const follow = useFollow();
  const streams = useLogStreams(group);
  // Giữ thứ tự Floci trả (event mới nhất trên), chỉ chia trang
  const { items, paginationProps } = useCollection(streams.data ?? [], {
    pagination: { pageSize: TABLE_PAGE_SIZE },
  });

  const columns: TableProps.ColumnDefinition<LogStream>[] = [
    {
      id: "name",
      header: "Log stream",
      isRowHeader: true,
      cell: (stream) => (
        <Link href={logsRoutes.stream(group, stream.logStreamName ?? "")} onFollow={follow}>
          {stream.logStreamName}
        </Link>
      ),
    },
    { id: "last", header: "Last event", cell: (stream) => formatDate(stream.lastEventTimestamp) },
  ];

  return (
    <Table
      items={items}
      trackBy='logStreamName'
      loading={streams.isLoading}
      loadingText='Loading log streams'
      columnDefinitions={columns}
      wrapLines
      empty={emptyOrError(
        streams,
        <EmptyState title='No log streams' description='Nothing has written to this group yet.' />,
      )}
      header={
        <Header
          counter={streams.data ? `(${streams.data.length})` : undefined}
          actions={<ActionBar compact={false} actions={[refreshAction(streams)]} />}
        >
          Log streams
        </Header>
      }
      pagination={<Pagination {...paginationProps} />}
    />
  );
}
