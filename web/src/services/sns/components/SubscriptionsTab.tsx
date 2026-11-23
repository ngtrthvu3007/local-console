import { useState } from "react";
import Header from "@cloudscape-design/components/header";
import Popover from "@cloudscape-design/components/popover";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { queueNameOfArn } from "../../sqs/queues.ts";
import { ENDPOINT_PREVIEW_LENGTH, RAW_DELIVERY_PROTOCOLS } from "../constants.ts";
import { summarizeFilterPolicy } from "../filterPolicy.ts";
import { useSubscriptions } from "../hooks/useSubscriptions.ts";
import { protocolLabel, type Subscription, type Topic } from "../topics.ts";
import {
  CreateSubscriptionModal,
  DeleteSubscriptionsModal,
  EditFilterModal,
  EditRawDeliveryModal,
} from "./SubscriptionModals.tsx";

const MODALS = {
  create: "create",
  filter: "filter",
  raw: "raw",
  delete: "delete",
} as const;

type ModalId = (typeof MODALS)[keyof typeof MODALS];

const ELLIPSIS = "…";
const PENDING_HELP =
  "Floci sent a SubscriptionConfirmation to this URL. Your app must call the SubscribeURL in it before it receives messages.";

const shorten = (text: string) =>
  text.length > ENDPOINT_PREVIEW_LENGTH
    ? `${text.slice(0, ENDPOINT_PREVIEW_LENGTH)}${ELLIPSIS}`
    : text;

function EndpointCell({ subscription }: { subscription: Subscription }) {
  if (subscription.protocol === "sqs")
    return <QueueLink name={queueNameOfArn(subscription.endpoint)} />;
  if (subscription.protocol === "lambda") return <FunctionLink arn={subscription.endpoint} />;
  return <span title={subscription.endpoint}>{shorten(subscription.endpoint)}</span>;
}

function StatusCell({ subscription }: { subscription: Subscription }) {
  if (!subscription.pending) return <StatusIndicator type='success'>Confirmed</StatusIndicator>;

  return (
    <Popover content={PENDING_HELP} triggerType='custom' dismissButton={false}>
      <StatusIndicator type='pending'>Pending confirmation</StatusIndicator>
    </Popover>
  );
}

const protocolColumn: TableProps.ColumnDefinition<Subscription> = {
  id: "protocol",
  header: "Protocol",
  cell: (subscription) => protocolLabel(subscription.protocol),
};

const endpointColumn: TableProps.ColumnDefinition<Subscription> = {
  id: "endpoint",
  header: "Endpoint",
  isRowHeader: true,
  cell: (subscription) => <EndpointCell subscription={subscription} />,
};

const statusColumn: TableProps.ColumnDefinition<Subscription> = {
  id: "status",
  header: "Status",
  cell: (subscription) => <StatusCell subscription={subscription} />,
};

const rawColumn: TableProps.ColumnDefinition<Subscription> = {
  id: "raw",
  header: "Raw",
  cell: (subscription) => {
    if (!RAW_DELIVERY_PROTOCOLS.includes(subscription.protocol)) return NOT_AVAILABLE;
    return subscription.rawDelivery ? "Yes" : "No";
  },
};

const filterColumn: TableProps.ColumnDefinition<Subscription> = {
  id: "filter",
  header: "Filter",
  cell: (subscription) => summarizeFilterPolicy(subscription.filterPolicy),
};

const WIDE_COLUMNS = [protocolColumn, endpointColumn, statusColumn, rawColumn, filterColumn];
// Khung hẹp vẫn cần Protocol: queue và function có thể trùng tên
const COMPACT_COLUMNS = [endpointColumn, protocolColumn, statusColumn];

export function SubscriptionsTab({ topic }: { topic: Topic }) {
  const { ref, compact } = useIsCompact();
  const subscriptions = useSubscriptions(topic.arn, topic.name);
  const [selected, setSelected] = useState<Subscription[]>([]);
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);
  const rows = subscriptions.data ?? [];
  const single = selected.length === 1 ? selected[0] : undefined;
  const canEditRaw = single && RAW_DELIVERY_PROTOCOLS.includes(single.protocol);

  const barActions: BarAction[] = [
    refreshAction(subscriptions),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setModal(MODALS.delete),
    },
    {
      id: "create",
      text: "Create subscription",
      primary: true,
      onClick: () => setModal(MODALS.create),
    },
  ];

  const menuItems = [
    { id: MODALS.filter, text: "Edit filter policy", disabled: !single },
    { id: MODALS.raw, text: "Edit raw delivery", disabled: !canEditRaw },
  ];

  return (
    <div ref={ref}>
      <Table
        variant='container'
        selectionType='multi'
        ariaLabels={selectionLabels<Subscription>("subscription", (item) => item.endpoint)}
        trackBy='arn'
        items={rows}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={subscriptions.isLoading}
        loadingText='Loading subscriptions'
        columnDefinitions={compact ? COMPACT_COLUMNS : WIDE_COLUMNS}
        wrapLines
        empty={emptyOrError(
          subscriptions,
          <EmptyState
            title='No subscriptions'
            description='Messages published to this topic go nowhere yet.'
          />,
        )}
        header={
          <Header
            counter={subscriptions.data ? `(${rows.length})` : undefined}
            description='Where messages published to this topic are delivered.'
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(id) => setModal(id as ModalId)}
              />
            }
          >
            Subscriptions
          </Header>
        }
      />
      {modal === MODALS.create && <CreateSubscriptionModal topic={topic} onDismiss={closeModal} />}
      {modal === MODALS.filter && single && (
        <EditFilterModal subscription={single} topicName={topic.name} onDismiss={closeModal} />
      )}
      {modal === MODALS.raw && single && (
        <EditRawDeliveryModal subscription={single} topicName={topic.name} onDismiss={closeModal} />
      )}
      {modal === MODALS.delete && (
        <DeleteSubscriptionsModal
          subscriptions={selected}
          topicName={topic.name}
          onDismiss={closeModal}
          onDone={() => {
            closeModal();
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}
