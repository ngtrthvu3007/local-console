import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { DescribeBrokerResponse } from "@aws-sdk/client-mq";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { ENGINE_LABEL, HOST_PORT_HINT } from "../constants.ts";

const CONNECT_COLUMNS = 2;
const GENERAL_COLUMNS = 4;

const copyable = (text?: string) =>
  text ? <CopyButton variant='inline' text={text} label={text} /> : NOT_AVAILABLE;

export function DetailsTab({ broker }: { broker: DescribeBrokerResponse }) {
  // Khung hẹp: một cột, để endpoint không bị bẻ giữa chữ
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const instance = broker.BrokerInstances?.[0];

  // Floci báo địa chỉ trong mạng compose: đúng cho app chạy trong cùng docker compose
  const connectItems: KeyValuePairsProps.Item[] = [
    { label: "AMQP endpoint", value: copyable(instance?.Endpoints?.[0]) },
    { label: "Management console", value: copyable(instance?.ConsoleURL) },
  ];
  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Engine", value: `${ENGINE_LABEL} ${broker.EngineVersion ?? ""}`.trim() },
    { label: "State", value: broker.BrokerState ?? NOT_AVAILABLE },
    { label: "Deployment mode", value: broker.DeploymentMode ?? NOT_AVAILABLE },
    { label: "Instance type", value: broker.HostInstanceType ?? NOT_AVAILABLE },
    { label: "Created", value: formatDate(broker.Created) },
    { label: "Broker ID", value: copyable(broker.BrokerId) },
    { label: "ARN", value: copyable(broker.BrokerArn) },
  ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container
          header={
            <Header variant='h2' description='For apps in the same docker compose as Floci.'>
              Connect
            </Header>
          }
        >
          <SpaceBetween size='m'>
            <KeyValuePairs columns={compact ? 1 : CONNECT_COLUMNS} items={connectItems} />
            <Box color='text-body-secondary'>{HOST_PORT_HINT}</Box>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs columns={compact ? 1 : GENERAL_COLUMNS} items={generalItems} />
        </Container>
      </SpaceBetween>
    </div>
  );
}
