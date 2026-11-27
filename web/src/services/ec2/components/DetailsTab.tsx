import type { Image, Instance } from "@aws-sdk/client-ec2";
import Alert from "@cloudscape-design/components/alert";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { INSTANCE_STATES, instanceId, stateOf } from "@localconsole/core/ec2";
import { InstanceStatus } from "./InstanceStatus.tsx";
import { OsIcon } from "./OsIcon.tsx";

interface Props {
  instance: Instance;
  image?: Image;
}

export function DetailsTab({ instance, image }: Props) {
  const id = instanceId(instance);
  // Floci không cho biết instance bị Terminated vì sao; người dùng tự Terminate cũng ra y như vậy
  const terminated = stateOf(instance) === INSTANCE_STATES.terminated;

  return (
    <SpaceBetween size='l'>
      {terminated && (
        <Alert type='info'>
          This instance is terminated. If you didn&apos;t terminate it, Floci couldn&apos;t start it
          (often an image pull failure). Check the Floci logs.
        </Alert>
      )}
      <Container header={<Header variant='h2'>Details</Header>}>
        <KeyValuePairs
          columns={3}
          items={[
            { label: "Instance ID", value: <CopyButton variant='inline' text={id} label={id} /> },
            { label: "State", value: <InstanceStatus instance={instance} /> },
            { label: "Instance type", value: instance.InstanceType ?? NOT_AVAILABLE },
            {
              label: "AMI",
              value: (
                <SpaceBetween size='xs' direction='horizontal'>
                  <OsIcon image={image} />
                  <span>
                    {[instance.ImageId, image?.Description].filter(Boolean).join(DETAIL_SEPARATOR)}
                  </span>
                </SpaceBetween>
              ),
            },
            { label: "Launch time", value: formatDate(instance.LaunchTime) },
          ]}
        />
      </Container>
    </SpaceBetween>
  );
}
