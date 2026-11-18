import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { formatBytes, formatDate, formatDuration } from "@shared/format.ts";
import { ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useDeadLetterSources } from "../hooks/useQueues.ts";
import { queueNameOfArn, queueTypeLabel, queueUrlAt, type Queue } from "../queues.ts";
import { QueueLink } from "./QueueLink.tsx";
import { EditDeadLetterModal, EditSettingsModal } from "./SettingsModals.tsx";

const DETAILS_COLUMNS = 3;
const CONNECT_COLUMNS = 2;
const SETTINGS_COLUMNS = 3;
const MODALS = { settings: "settings", deadLetter: "deadLetter" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

const copyable = (text: string) => <CopyButton variant='inline' text={text} label={text} />;

export function SettingsTab({ queue }: { queue: Queue }) {
  const { flociPublicUrl, flociInternalUrl } = useLoadedConfig();
  // Điện thoại: khối có URL/ARN dài để một cột, giống MQ và ElastiCache
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const sources = useDeadLetterSources(queue);
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);
  const { settings, redrivePolicy } = queue;

  const detailItems: KeyValuePairsProps.Item[] = [
    { label: "Type", value: queueTypeLabel(queue) },
    { label: "Created", value: formatDate(queue.created) },
    { label: "Last modified", value: formatDate(queue.modified) },
    { label: "URL", value: copyable(queue.url) },
    { label: "ARN", value: copyable(queue.arn) },
  ];

  // App chạy trên máy dev gọi localhost:4566, app trong cùng compose gọi floci:4566
  const connectItems: KeyValuePairsProps.Item[] = [
    { label: "From your machine", value: copyable(queueUrlAt(flociPublicUrl, queue.url)) },
    {
      label: "From a container in compose",
      value: copyable(queueUrlAt(flociInternalUrl, queue.url)),
    },
  ];

  const settingItems: KeyValuePairsProps.Item[] = [
    { label: "Visibility timeout", value: formatDuration(settings.visibilityTimeout) },
    { label: "Delivery delay", value: formatDuration(settings.delay) },
    { label: "Message retention", value: formatDuration(settings.retention) },
    { label: "Maximum message size", value: formatBytes(settings.maxMessageSize) },
    { label: "Receive message wait time", value: formatDuration(settings.receiveWait) },
    ...(queue.fifo
      ? [{ label: "Content-based deduplication", value: settings.contentBasedDedup ? "On" : "Off" }]
      : []),
  ];

  const deadLetterBody = redrivePolicy ? (
    <KeyValuePairs
      columns={2}
      items={[
        {
          label: "Dead-letter queue",
          value: <QueueLink name={queueNameOfArn(redrivePolicy.deadLetterTargetArn)} />,
        },
        { label: "Maximum receives", value: redrivePolicy.maxReceiveCount },
      ]}
    />
  ) : (
    <Box color='text-body-secondary'>
      Off. Turn it on to move messages that keep failing to another queue.
    </Box>
  );

  const sourceNames = sources.data ?? [];
  const editButton = (id: ModalId) => <Button onClick={() => setModal(id)}>Edit</Button>;

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>Details</Header>}>
          <KeyValuePairs columns={compact ? 1 : DETAILS_COLUMNS} items={detailItems} />
        </Container>
        <Container
          header={
            <Header variant='h2' description='Queue URL for your app, by where it runs.'>
              Connect
            </Header>
          }
        >
          <KeyValuePairs columns={compact ? 1 : CONNECT_COLUMNS} items={connectItems} />
        </Container>
        <Container
          header={
            <Header variant='h2' actions={editButton(MODALS.settings)}>
              Settings
            </Header>
          }
        >
          <KeyValuePairs columns={SETTINGS_COLUMNS} items={settingItems} />
        </Container>
        <Container
          header={
            <Header variant='h2' actions={editButton(MODALS.deadLetter)}>
              Dead-letter queue
            </Header>
          }
        >
          {deadLetterBody}
        </Container>
        {sourceNames.length > 0 && (
          <Container
            header={
              <Header
                variant='h2'
                counter={`(${sourceNames.length})`}
                description='Queues that send failed messages here.'
              >
                Dead-letter queue of
              </Header>
            }
          >
            <SpaceBetween direction='horizontal' size='m'>
              {sourceNames.map((name) => (
                <QueueLink key={name} name={name} />
              ))}
            </SpaceBetween>
          </Container>
        )}

        {modal === MODALS.settings && <EditSettingsModal queue={queue} onDismiss={closeModal} />}
        {modal === MODALS.deadLetter && (
          <EditDeadLetterModal queue={queue} onDismiss={closeModal} />
        )}
      </SpaceBetween>
    </div>
  );
}
