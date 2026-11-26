import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import {
  appConnectionString,
  localConnectionString,
  socatCommand,
  type ClusterRow,
} from "../clusters.ts";
import { clusterSample } from "../codeSamples.ts";
import { TEXT } from "../constants.ts";

const DETAILS_COLUMNS = 4;

export function ConnectivityTab({ cluster }: { cluster: ClusterRow }) {
  return (
    <SpaceBetween size='l'>
      <Alert type='info'>{TEXT.restart}</Alert>
      <Container header={<Header variant='h2'>Endpoints</Header>}>
        <KeyValuePairs
          columns={DETAILS_COLUMNS}
          items={[
            { label: "Endpoint", value: copyable(cluster.endpoint) },
            { label: "Reader endpoint", value: copyable(cluster.readerEndpoint) },
            { label: "Port", value: cluster.port },
            { label: "Master username", value: cluster.username ?? NOT_AVAILABLE },
          ]}
        />
      </Container>
      <Container
        header={
          <Header variant='h2' description={`${TEXT.noTls} ${TEXT.encodePassword}`}>
            From apps in Docker Compose or Lambda
          </Header>
        }
      >
        <CodeSnippet
          code={appConnectionString(cluster, cluster.username)}
          ariaLabel='Connection string for apps in Docker'
          wrap
        />
      </Container>
      <Container
        header={
          <Header variant='h2' description={TEXT.forwardIntro}>
            From a GUI on your machine (MongoDB Compass, mongosh)
          </Header>
        }
      >
        <SpaceBetween size='m'>
          <CodeSnippet code={socatCommand(cluster.id)} ariaLabel='Port forward command' wrap />
          <Box variant='p'>Then connect Compass or mongosh to:</Box>
          <CodeSnippet
            code={localConnectionString(cluster.username)}
            ariaLabel='Connection string for Compass'
            wrap
          />
          <Box color='text-body-secondary'>
            {TEXT.encodePassword} {TEXT.forwardNote(cluster.id)}
          </Box>
        </SpaceBetween>
      </Container>
      <ConnectCard sample={clusterSample()} />
    </SpaceBetween>
  );
}
