import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { TerminalBlock } from "@shared/components/TerminalBlock.tsx";
import { AWS_TEST_CREDENTIALS } from "@localconsole/core/shared";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

// SDK JS v3 đọc AWS_REGION, boto3 chỉ đọc AWS_DEFAULT_REGION (thiếu là
// NoRegionError, đã gặp khi chạy code mẫu Python): ghi cả hai
const environmentFor = (endpoint: string, region: string) =>
  [
    `AWS_ENDPOINT_URL=${endpoint}`,
    `AWS_ACCESS_KEY_ID=${AWS_TEST_CREDENTIALS.accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${AWS_TEST_CREDENTIALS.secretAccessKey}`,
    `AWS_REGION=${region}`,
    `AWS_DEFAULT_REGION=${region}`,
  ].join("\n");

const COPY_ENVIRONMENT_LABEL = "Copy environment variables";

// Cùng ô terminal với lệnh trên trang Floci tắt; ghi chú nhỏ bên dưới như ở đó.
// Tab tắt padding nội dung nên tự chừa khoảng dưới thanh tab. Card "Connect your AI agent" dùng chung
export function TabCodeBlock({
  code,
  note,
  copyLabel = COPY_ENVIRONMENT_LABEL,
}: {
  code: string;
  note: string;
  copyLabel?: string;
}) {
  return (
    <Box padding={{ top: "s" }}>
      <SpaceBetween size='s'>
        <TerminalBlock code={code} copyLabel={copyLabel} />
        <Box variant='small' color='text-body-secondary'>
          {note}
        </Box>
      </SpaceBetween>
    </Box>
  );
}

export function ConnectYourApp() {
  const config = useLoadedConfig();

  const tabs: TabsProps.Tab[] = [
    {
      id: "host",
      label: "On host",
      content: (
        <TabCodeBlock
          code={environmentFor(config.flociPublicUrl, config.region)}
          note='For apps started with npm, go run, IDE debuggers…'
        />
      ),
    },
    {
      id: "docker",
      label: "In Docker",
      content: (
        <TabCodeBlock
          code={environmentFor(config.flociInternalUrl, config.region)}
          note='The service must be on the same Compose network as Floci.'
        />
      ),
    },
  ];

  const header = (
    <Header
      variant='h2'
      description="Paste these into your app's environment. S3 clients also need forcePathStyle: true."
    >
      Connect your app
    </Header>
  );

  return (
    <Container fitHeight header={header}>
      <Tabs disableContentPaddings tabs={tabs} />
    </Container>
  );
}
