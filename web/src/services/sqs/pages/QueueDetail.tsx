import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR, lastArnPart } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteQueuesModal } from "../components/DeleteQueuesModal.tsx";
import { MessagesTab } from "../components/MessagesTab.tsx";
import { PurgeModal, RedriveModal, SendMessageModal } from "../components/MessageModals.tsx";
import { SettingsTab } from "../components/SettingsTab.tsx";
import { TriggersTab } from "../components/TriggersTab.tsx";
import {
  isQueueMissing,
  messageCountsText,
  queueTypeLabel,
  type Queue,
  QUEUE_TABS,
  sqsRoutes,
} from "@localconsole/core/sqs";
import { useDeadLetterSources, useQueue } from "../hooks/useQueues.ts";
import { queueCrumbs } from "../routes.ts";

const MODALS = { send: "send", purge: "purge", delete: "delete", redrive: "redrive" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

// "Standard · 12 available · 1 in flight · 0 delayed · DLQ: orders-dlq"
const queueSummary = (queue: Queue) =>
  [
    queueTypeLabel(queue),
    messageCountsText(queue),
    queue.redrivePolicy && `DLQ: ${lastArnPart(queue.redrivePolicy.deadLetterTargetArn)}`,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);

function QueueView({
  queue,
  autoRefresh,
  onAutoRefreshChange,
}: {
  queue: Queue;
  autoRefresh: boolean;
  onAutoRefreshChange: (autoRefresh: boolean) => void;
}) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(QUEUE_TABS, QUEUE_TABS.messages);
  const sources = useDeadLetterSources(queue);
  const sourceNames = sources.data ?? [];
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);

  const tabs: TabsProps.Tab[] = [
    {
      id: QUEUE_TABS.messages,
      label: "Messages",
      content: (
        <MessagesTab
          queue={queue}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={onAutoRefreshChange}
        />
      ),
    },
    { id: QUEUE_TABS.triggers, label: "Lambda triggers", content: <TriggersTab queue={queue} /> },
    { id: QUEUE_TABS.settings, label: "Settings", content: <SettingsTab queue={queue} /> },
  ];

  // Queue là DLQ của queue khác thì có thêm nút redrive
  const barActions: BarAction[] = [
    ...(sourceNames.length
      ? [{ id: MODALS.redrive, text: "Start DLQ redrive", onClick: () => setModal(MODALS.redrive) }]
      : []),
    { id: MODALS.purge, text: "Purge", onClick: () => setModal(MODALS.purge) },
    { id: MODALS.delete, text: "Delete", onClick: () => setModal(MODALS.delete) },
    { id: MODALS.send, text: "Send message", primary: true, onClick: () => setModal(MODALS.send) },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {queueSummary(queue)}
          <StackLink separated type='AWS::SQS::Queue' physicalId={queue.url} />
        </>
      }
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {queue.name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </ContentLayout>
      {modal === MODALS.send && <SendMessageModal queue={queue} onDismiss={closeModal} />}
      {modal === MODALS.purge && <PurgeModal queue={queue} onDismiss={closeModal} />}
      {modal === MODALS.redrive && (
        <RedriveModal queue={queue} sources={sourceNames} onDismiss={closeModal} />
      )}
      {modal === MODALS.delete && (
        <DeleteQueuesModal
          queues={[queue]}
          onDismiss={closeModal}
          onDone={() => navigate(sqsRoutes.queues)}
        />
      )}
    </div>
  );
}

export function QueueDetail() {
  const { queue: queueName = "" } = useParams();
  // Auto refresh nằm ở tab Messages nhưng làm mới cả số message trên header
  const [autoRefresh, setAutoRefresh] = useState(false);
  const details = useQueue(queueName, autoRefresh);

  useBreadcrumbs(queueCrumbs(queueName));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isQueueMissing(details.error),
    title: `Queue ${queueName} not found`,
    backHref: sqsRoutes.queues,
    backText: "View queues",
  });
  if (state || !details.data) return state;

  return (
    <QueueView
      queue={details.data}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
    />
  );
}
