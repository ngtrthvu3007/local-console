import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CodeSamples } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { topicSample } from "../codeSamples.ts";
import { topicTypeLabel, type Topic } from "../topics.ts";

const DETAILS_COLUMNS = 3;
const CONNECT_COLUMNS = 2;
const ENDPOINT_VARIABLE = "AWS_ENDPOINT_URL";

const copyable = (text: string) => <CopyButton variant='inline' text={text} label={text} />;

export function DetailsTab({ topic }: { topic: Topic }) {
  const { flociPublicUrl, flociInternalUrl } = useLoadedConfig();
  // Điện thoại: khối có ARN/URL dài để một cột, giống SQS
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);

  const detailItems: KeyValuePairsProps.Item[] = [
    { label: "Type", value: topicTypeLabel(topic) },
    { label: "Subscriptions", value: topic.subscriptions },
    { label: "ARN", value: copyable(topic.arn) },
    ...(topic.fifo
      ? [
          {
            label: "Content-based deduplication",
            value: topic.contentBasedDedup ? "On" : "Off",
          },
        ]
      : []),
  ];

  // App chạy trên máy dev gọi localhost:4566, app trong cùng compose gọi floci:4566; ARN giống nhau
  const connectItems: KeyValuePairsProps.Item[] = [
    { label: "TopicArn", value: copyable(`TopicArn=${topic.arn}`) },
    {
      label: "From your machine",
      value: copyable(`${ENDPOINT_VARIABLE}=${flociPublicUrl}`),
    },
    {
      label: "From a container in compose",
      value: copyable(`${ENDPOINT_VARIABLE}=${flociInternalUrl}`),
    },
  ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs columns={compact ? 1 : DETAILS_COLUMNS} items={detailItems} />
        </Container>
        <Container
          header={
            <Header variant='h2' description='Settings for your app, by where it runs.'>
              Connect
            </Header>
          }
        >
          <SpaceBetween size='m'>
            <KeyValuePairs columns={compact ? 1 : CONNECT_COLUMNS} items={connectItems} />
            <CodeSamples sample={topicSample(topic)} />
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </div>
  );
}
