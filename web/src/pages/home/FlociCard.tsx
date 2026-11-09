import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useFlociStatus } from "@shared/hooks/useFlociStatus.ts";

const valueOrDash = (value?: string) =>
  value ?? <Box color='text-status-inactive'>{NOT_AVAILABLE}</Box>;

export function FlociCard() {
  const floci = useFlociStatus();

  const statuses = {
    checking: <StatusIndicator type='loading'>Checking</StatusIndicator>,
    running: <StatusIndicator type='success'>Running</StatusIndicator>,
    down: (
      <SpaceBetween size='xxs'>
        <StatusIndicator type='error'>Unreachable</StatusIndicator>
        <Box color='text-body-secondary'>
          Last checked {floci.checkedAt}.{" "}
          <Button variant='inline-link' onClick={floci.refresh}>
            Retry
          </Button>
        </Box>
      </SpaceBetween>
    ),
  };

  const servicesRunning = floci.servicesTotal
    ? `${floci.servicesRunning} of ${floci.servicesTotal}`
    : undefined;

  const items: KeyValuePairsProps.Item[] = [
    { label: "Status", value: statuses[floci.state] },
    { label: "Version", value: valueOrDash(floci.version) },
    { label: "Edition", value: valueOrDash(floci.edition) },
    { label: "Services running", value: valueOrDash(servicesRunning) },
  ];

  return (
    <Container fitHeight header={<Header variant='h2'>Floci</Header>}>
      <KeyValuePairs columns={1} items={items} />
    </Container>
  );
}
