import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { StreamTriggersTable } from "../../lambda/components/StreamTriggers.tsx";
import { ConfigurationTab } from "../components/ConfigurationTab.tsx";
import { DataViewerTab } from "../components/DataViewerTab.tsx";
import { DeleteStreamsModal } from "../components/DeleteStreamsModal.tsx";
import { PutRecordModal } from "../components/PutRecordModal.tsx";
import { useStream } from "../hooks/useStreams.ts";
import { streamModeLabel } from "../recordData.ts";
import { STREAM_TABS, kinesisRoutes, streamCrumbs } from "../routes.ts";
import { STREAM_STATUS_STYLES } from "../constants.ts";

export function StreamDetail() {
  const { streamName: name = "" } = useParams();
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(STREAM_TABS, STREAM_TABS.dataViewer);
  const details = useStream(name);
  const stream = details.data ?? undefined;
  const [deleting, setDeleting] = useState(false);
  const [putting, setPutting] = useState(false);

  useBreadcrumbs(streamCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(stream),
    notFound: details.data === null,
    title: `Data stream ${name} not found`,
    backHref: kinesisRoutes.streams,
    backText: "View data streams",
  });
  if (state || !stream) return state;

  const openShards = stream.OpenShardCount;

  const tabs: TabsProps.Tab[] = [
    {
      id: STREAM_TABS.dataViewer,
      label: "Data viewer",
      content: <DataViewerTab stream={name} />,
    },
    {
      id: STREAM_TABS.configuration,
      label: "Configuration",
      content: <ConfigurationTab stream={stream} />,
    },
    {
      id: STREAM_TABS.lambdaTriggers,
      label: "Lambda triggers",
      content: (
        <StreamTriggersTable
          source='kinesis'
          sourceName={name}
          streamArn={stream.StreamARN ?? ""}
          runsWhen={`records arrive in ${name}`}
          description='Functions that run when records arrive in this stream.'
          compact={compact}
        />
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(details),
    { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
    { id: "put", text: "Put record", primary: true, onClick: () => setPutting(true) },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <StatusBadge status={stream.StreamStatus} styles={STREAM_STATUS_STYLES} />
          {DETAIL_SEPARATOR}
          {streamModeLabel(stream.StreamModeDetails?.StreamMode)}
          {DETAIL_SEPARATOR}
          {openShards === undefined ? NOT_AVAILABLE : pluralize(openShards, "open shard")}
          <StackLink separated type='AWS::Kinesis::Stream' physicalId={name} />
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
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </ContentLayout>
      {putting && <PutRecordModal stream={stream} onDismiss={() => setPutting(false)} />}
      {deleting && (
        <DeleteStreamsModal
          streams={[{ name, arn: stream.StreamARN ?? "" }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(kinesisRoutes.streams)}
        />
      )}
    </div>
  );
}
