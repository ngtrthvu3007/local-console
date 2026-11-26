import { useState } from "react";
import { useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Toggle from "@cloudscape-design/components/toggle";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { logEventColumns } from "@shared/logs/columns.tsx";
import { useLogGroup } from "../hooks/useLogGroups.ts";
import { useStreamEvents } from "../hooks/useLogStreams.ts";
import { SEARCH_PARAMS, groupCrumbs, logsRoutes } from "../routes.ts";

export function LogStream() {
  const [params] = useSearchParams();
  const group = params.get(SEARCH_PARAMS.group) ?? "";
  const stream = params.get(SEARCH_PARAMS.stream) ?? "";
  const [autoRefresh, setAutoRefresh] = useState(false);
  // Group không có thì DescribeLogStreams trả 400: hỏi group trước
  const groupDetails = useLogGroup(group);
  const groupExists = groupDetails.data === undefined ? undefined : groupDetails.data !== null;
  const events = useStreamEvents(group, stream, groupExists, autoRefresh);

  useBreadcrumbs([...groupCrumbs(group), { text: stream, href: logsRoutes.stream(group, stream) }]);

  // Hỏi group lỗi (Floci tắt, proxy lỗi) thì query stream không bao giờ chạy: hiện lỗi của group
  // "Không có" lấy từ cache mà đang tải lại (vd vừa Send test event) thì chờ, không nháy not found
  const checking = events.data === null && (groupDetails.isFetching || events.isFetching);
  const query = groupDetails.isError ? groupDetails : events;
  const state = pageState(
    { ...query, isLoading: query.isLoading || checking },
    {
      ready: Boolean(events.data),
      notFound: events.data === null,
      title: `Log stream ${stream} not found`,
      backHref: logsRoutes.group(group),
      backText: "View log group",
    },
  );
  if (state || !events.data) return state;

  return (
    <Table
      variant='full-page'
      items={events.data}
      trackBy={(event) => `${event.timestamp}:${event.ingestionTime}:${event.message}`}
      columnDefinitions={logEventColumns}
      wrapLines
      cellVerticalAlign='top'
      empty={emptyOrError(events, <EmptyState title='No events in this stream' />)}
      header={
        <Header
          variant='awsui-h1-sticky'
          counter={`(${events.data.length})`}
          description={`${group} › ${stream}`}
          actions={
            <ResponsiveActions>
              <Toggle
                checked={autoRefresh}
                onChange={({ detail }) => setAutoRefresh(detail.checked)}
              >
                Auto refresh
              </Toggle>
              {/* Tự làm mới thì không quay spinner mỗi 5 giây */}
              <Button
                iconName='refresh'
                ariaLabel='Refresh'
                loading={events.isFetching && !autoRefresh && !events.isFetchingNextPage}
                onClick={() => events.refetch()}
              />
            </ResponsiveActions>
          }
        >
          Log events
        </Header>
      }
      footer={
        events.hasOlder && (
          <Box textAlign='center'>
            <Button loading={events.isFetchingNextPage} onClick={() => events.loadOlder()}>
              Load older events
            </Button>
          </Box>
        )
      }
    />
  );
}
