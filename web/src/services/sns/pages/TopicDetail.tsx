import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { copyToClipboard } from "@shared/clipboard.ts";
import { DETAIL_SEPARATOR, pluralize } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteTopicsModal } from "../components/DeleteTopicsModal.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { PublishModal } from "../components/PublishModal.tsx";
import { SubscriptionsTab } from "../components/SubscriptionsTab.tsx";
import {
  isTopicMissing,
  TOPIC_TABS,
  snsRoutes,
  topicTypeLabel,
  type Topic,
} from "@localconsole/core/sns";
import { useTopic } from "../hooks/useTopics.ts";
import { topicCrumbs } from "../routes.ts";

const MODALS = { publish: "publish", delete: "delete" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

function TopicView({ topic }: { topic: Topic }) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(TOPIC_TABS, TOPIC_TABS.subscriptions);
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);

  const tabs: TabsProps.Tab[] = [
    {
      id: TOPIC_TABS.subscriptions,
      label: "Subscriptions",
      content: <SubscriptionsTab topic={topic} />,
    },
    { id: TOPIC_TABS.details, label: "Details", content: <DetailsTab topic={topic} /> },
  ];

  const barActions: BarAction[] = [
    { id: MODALS.delete, text: "Delete", onClick: () => setModal(MODALS.delete) },
    {
      id: MODALS.publish,
      text: "Publish message",
      primary: true,
      onClick: () => setModal(MODALS.publish),
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {[topicTypeLabel(topic), pluralize(topic.subscriptions, "subscription")].join(
            DETAIL_SEPARATOR,
          )}
          <StackLink separated type='AWS::SNS::Topic' physicalId={topic.arn} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={[{ id: "copy", text: "Copy ARN" }]}
          onMenuItemClick={() => copyToClipboard(topic.arn, "ARN")}
        />
      }
    >
      {topic.name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </ContentLayout>
      {modal === MODALS.publish && <PublishModal topic={topic} onDismiss={closeModal} />}
      {modal === MODALS.delete && (
        <DeleteTopicsModal
          topics={[topic]}
          onDismiss={closeModal}
          onDone={() => navigate(snsRoutes.topics)}
        />
      )}
    </div>
  );
}

export function TopicDetail() {
  const { topic: topicName = "" } = useParams();
  const details = useTopic(topicName);

  useBreadcrumbs(topicCrumbs(topicName));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isTopicMissing(details.error),
    title: `Topic ${topicName} not found`,
    backHref: snsRoutes.topics,
    backText: "View topics",
  });
  if (state || !details.data) return state;

  return <TopicView topic={details.data} />;
}
