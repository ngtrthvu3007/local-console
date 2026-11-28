import type { ContainerDefinition } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { copyable } from "@shared/components/CopyButton.tsx";
import { LIST_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { secretRefOf } from "../arns.ts";
import { AWSLOGS_OPTIONS } from "../constants.ts";
import { secretsRoutes } from "../../secretsmanager/routes.ts";
import { ssmRoutes } from "../../ssm/routes.ts";

const DETAILS_COLUMNS = 3;

// valueFrom là ARN secret (có thể kèm JSON key) hoặc tên / ARN parameter: trang SSM đọc được cả ARN
function SecretSource({ valueFrom }: { valueFrom: string }) {
  const follow = useFollow();
  const ref = secretRefOf(valueFrom);
  const href =
    ref.kind === "secret" ? secretsRoutes.secret(ref.name) : ssmRoutes.parameter(ref.name);
  return (
    <Link href={href} onFollow={follow}>
      {ref.name}
    </Link>
  );
}

function ContainerDetails({ container }: { container: ContainerDefinition }) {
  const { logDriver, options = {} } = container.logConfiguration ?? {};
  const secrets = container.secrets ?? [];
  const ports = (container.portMappings ?? []).map(
    (port) => `${port.containerPort}/${port.protocol ?? "tcp"}`,
  );

  return (
    <Container header={<Header variant='h2'>{container.name}</Header>}>
      <KeyValuePairs
        columns={DETAILS_COLUMNS}
        items={[
          { label: "Image", value: copyable(container.image) },
          { label: "Essential", value: container.essential === false ? "No" : "Yes" },
          { label: "Port mappings", value: ports.join(LIST_SEPARATOR) || NOT_AVAILABLE },
          {
            // Mảng JSON một dòng, cùng dạng ô ghi đè command ở Run task
            label: "Command",
            value: container.command?.length ? (
              <Box variant='code'>{JSON.stringify(container.command)}</Box>
            ) : (
              NOT_AVAILABLE
            ),
          },
          {
            label: "Environment variables",
            value: container.environment?.length ? (
              <Box variant='code'>
                {container.environment.map((env) => (
                  <div key={env.name}>{`${env.name}=${env.value}`}</div>
                ))}
              </Box>
            ) : (
              NOT_AVAILABLE
            ),
          },
          {
            label: "Secrets",
            value: secrets.length ? (
              <SpaceBetween size='xxs'>
                {secrets.map((secret) => (
                  <div key={secret.name}>
                    {secret.name} ← <SecretSource valueFrom={secret.valueFrom ?? ""} />
                  </div>
                ))}
              </SpaceBetween>
            ) : (
              NOT_AVAILABLE
            ),
          },
          {
            label: "Logs",
            value: logDriver
              ? [logDriver, options[AWSLOGS_OPTIONS.group], options[AWSLOGS_OPTIONS.streamPrefix]]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)
              : NOT_AVAILABLE,
          },
        ]}
      />
    </Container>
  );
}

// Mỗi container một khối thay vì bảng nhiều cột: env / secret / command dài, điện thoại vẫn đọc được
export function ContainersTab({ containers }: { containers: ContainerDefinition[] }) {
  return (
    <SpaceBetween size='l'>
      {containers.map((container) => (
        <ContainerDetails key={container.name} container={container} />
      ))}
    </SpaceBetween>
  );
}
