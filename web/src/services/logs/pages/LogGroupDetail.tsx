import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Tabs from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, formatBytes, formatDate } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { LogEvents } from "@shared/logs/LogEvents.tsx";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteLogGroupsModal } from "../components/DeleteLogGroupsModal.tsx";
import { EditRetentionModal } from "../components/EditRetentionModal.tsx";
import { SendTestEventModal } from "../components/SendTestEventModal.tsx";
import { StreamsTab } from "../components/StreamsTab.tsx";
import { SubscriptionFiltersTab } from "../components/SubscriptionFiltersTab.tsx";
import {
  TEXT,
  retentionLabel,
  logSourceOf,
  GROUP_TABS,
  SEARCH_PARAMS,
  logsRoutes,
} from "@localconsole/core/logs";
import { useLogGroup } from "../hooks/useLogGroups.ts";
import { groupCrumbs } from "../routes.ts";

const LOG_GROUP_TYPE = "AWS::Logs::LogGroup";

export function LogGroupDetail() {
  const [params] = useSearchParams();
  const name = params.get(SEARCH_PARAMS.group) ?? "";
  const navigate = useNavigate();
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(GROUP_TABS, GROUP_TABS.search, [SEARCH_PARAMS.group]);
  const details = useLogGroup(name);
  const group = details.data ?? undefined;
  const [modal, setModal] = useState<"delete" | "retention" | "event">();

  useBreadcrumbs(groupCrumbs(name));

  // "Không có" lấy từ cache (đã mở trang khi group chưa tạo) mà đang tải lại thì chờ, không nháy not found
  const checking = details.data === null && details.isFetching;
  const state = pageState(
    { ...details, isLoading: details.isLoading || checking },
    {
      ready: Boolean(group),
      notFound: details.data === null,
      title: `Log group ${name} not found`,
      backHref: logsRoutes.groups,
      backText: "View log groups",
    },
  );
  if (state || !group) return state;

  const source = logSourceOf(name);
  const barActions: BarAction[] = [
    refreshAction(details),
    { id: "delete", text: "Delete", onClick: () => setModal("delete") },
    { id: "retention", text: "Edit retention", onClick: () => setModal("retention") },
    { id: "event", text: "Send test event", primary: true, onClick: () => setModal("event") },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {[
            `Retention: ${retentionLabel(group.retentionInDays)}`,
            formatBytes(group.storedBytes),
            `Created ${formatDate(group.creationTime)}`,
          ].join(DETAIL_SEPARATOR)}
          {source && (
            <>
              {DETAIL_SEPARATOR}
              {source.label}:{" "}
              <Link href={source.href} onFollow={follow}>
                {source.name}
              </Link>
            </>
          )}
          <StackLink type={LOG_GROUP_TYPE} physicalId={name} separated />
        </>
      }
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => setTab(detail.activeTabId)}
          tabs={[
            {
              id: GROUP_TABS.search,
              label: "Search",
              content: (
                <LogEvents
                  logGroupName={name}
                  title='Log events'
                  description={TEXT.filterHelp}
                  filterPlaceholder={TEXT.filterPlaceholder}
                  empty={
                    <EmptyState
                      title='No log events in this time range'
                      description='Widen the range, or send a test event.'
                    />
                  }
                  streamHref={(stream) => logsRoutes.stream(name, stream)}
                />
              ),
            },
            { id: GROUP_TABS.streams, label: "Log streams", content: <StreamsTab group={name} /> },
            {
              id: GROUP_TABS.subscriptions,
              label: "Subscription filters",
              content: <SubscriptionFiltersTab group={name} />,
            },
          ]}
        />
      </ContentLayout>
      {modal === "delete" && (
        <DeleteLogGroupsModal
          names={[name]}
          onDismiss={() => setModal(undefined)}
          onDone={() => navigate(logsRoutes.groups)}
        />
      )}
      {modal === "retention" && (
        <EditRetentionModal
          group={name}
          days={group.retentionInDays}
          onDismiss={() => setModal(undefined)}
        />
      )}
      {modal === "event" && (
        <SendTestEventModal group={name} onDismiss={() => setModal(undefined)} />
      )}
    </div>
  );
}
