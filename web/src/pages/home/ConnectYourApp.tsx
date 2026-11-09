import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

const environmentFor = (endpoint: string, region: string) =>
  [
    `AWS_ENDPOINT_URL=${endpoint}`,
    `AWS_ACCESS_KEY_ID=${AWS_TEST_CREDENTIALS.accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${AWS_TEST_CREDENTIALS.secretAccessKey}`,
    `AWS_REGION=${region}`,
  ].join("\n");

export function ConnectYourApp() {
  const config = useLoadedConfig();

  const tabs: TabsProps.Tab[] = [
    {
      id: "host",
      label: "On host",
      content: (
        <CodeSnippet
          code={environmentFor(config.flociPublicUrl, config.region)}
          note='For apps started with npm, go run, IDE debuggers…'
        />
      ),
    },
    {
      id: "docker",
      label: "In Docker",
      content: (
        <CodeSnippet
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
