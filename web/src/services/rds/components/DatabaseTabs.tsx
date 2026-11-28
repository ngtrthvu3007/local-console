import type { DBInstance } from "@aws-sdk/client-rds";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { copyable, CopyButton } from "@shared/components/CopyButton.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { KeyLink } from "../../kms/components/KeyLink.tsx";
import { defaultKeyLabel } from "@localconsole/core/kms";
import { secretsRoutes } from "@localconsole/core/secretsmanager";
import { connectionUrl, databaseSample } from "../codeSamples.ts";
import { LogGroupLink } from "../../logs/components/LogGroupLink.tsx";
import {
  RDS_KEY_SERVICE,
  CREDENTIAL_TYPES,
  errorLogGroup,
  addressText,
  endpointOf,
  engineText,
  isSupportedEngine,
  machineAddress,
  type Address,
} from "@localconsole/core/rds";

export function ConnectivityTab({ database }: { database: DBInstance }) {
  const follow = useFollow();
  const { flociPublicUrl } = useLoadedConfig();
  const endpoint = endpointOf(database);
  const machine = machineAddress(flociPublicUrl, endpoint?.port);
  const engine = isSupportedEngine(database.Engine) ? database.Engine : undefined;
  const secretArn = database.MasterUserSecret?.SecretArn;
  // URL dài: xuống dòng sau dấu phân cách thay vì cắt giữa chữ (như Outputs của CloudFormation)
  const urlFor = (label: string, address?: Address) => {
    const url = engine && address && connectionUrl(engine, database, address);
    if (!url) return NOT_AVAILABLE;

    return (
      <span>
        <BreakableText text={url} />{" "}
        <CopyButton variant='icon' label={`Copy ${label}`} text={url} />
      </span>
    );
  };

  // Password không API nào trả: chỉ chỗ lấy (secret rds!… hoặc password đã đặt khi tạo)
  const password = secretArn ? (
    <Link href={secretsRoutes.secretOfArn(secretArn)} onFollow={follow}>
      Retrieve in Secrets Manager
    </Link>
  ) : (
    "The master password set when the database was created"
  );

  return (
    <SpaceBetween size='l'>
      <Container
        header={
          <Header
            variant='h2'
            description='Use the endpoint from Lambda functions and apps in Docker Compose. Apps and database clients on your machine use From your machine.'
          >
            Connectivity & security
          </Header>
        }
      >
        {/* URL dài nên nằm hàng riêng, ít cột hơn: điện thoại không bị bóp còn nửa ô */}
        <SpaceBetween size='l'>
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Endpoint", value: copyable(endpoint?.host) },
              { label: "Port", value: endpoint?.port ?? NOT_AVAILABLE },
              { label: "From your machine", value: copyable(machine && addressText(machine)) },
              { label: "Username", value: copyable(database.MasterUsername) },
              { label: "Database", value: copyable(database.DBName) },
              { label: "Password", value: password },
            ]}
          />
          <KeyValuePairs
            columns={2}
            items={[
              { label: "URL from your machine", value: urlFor("URL from your machine", machine) },
              {
                label: "URL from Docker Compose / Lambda",
                value: urlFor("URL from Docker Compose / Lambda", endpoint),
              },
            ]}
          />
        </SpaceBetween>
      </Container>
      {engine && machine && endpoint && (
        <ConnectCard sample={databaseSample(engine, database, machine, endpoint)} />
      )}
    </SpaceBetween>
  );
}

function MasterCredentials({ secretArn }: { secretArn?: string }) {
  const follow = useFollow();
  if (!secretArn) return <>{CREDENTIAL_TYPES.selfManaged}</>;

  return (
    <SpaceBetween size='xxs'>
      {copyable(secretArn)}
      <Link href={secretsRoutes.secretOfArn(secretArn)} onFollow={follow}>
        Manage in Secrets Manager
      </Link>
    </SpaceBetween>
  );
}

export function ConfigurationTab({ database }: { database: DBInstance }) {
  return (
    <Container header={<Header variant='h2'>Configuration</Header>}>
      <KeyValuePairs
        columns={3}
        items={[
          { label: "Engine", value: engineText(database) || NOT_AVAILABLE },
          { label: "Instance class", value: database.DBInstanceClass ?? NOT_AVAILABLE },
          { label: "Initial database", value: database.DBName || NOT_AVAILABLE },
          { label: "Master username", value: copyable(database.MasterUsername) },
          {
            label: "Master credentials",
            value: <MasterCredentials secretArn={database.MasterUserSecret?.SecretArn} />,
          },
          {
            label: "Storage encryption",
            value: !database.StorageEncrypted ? (
              "Not encrypted"
            ) : database.KmsKeyId ? (
              <KeyLink value={database.KmsKeyId} />
            ) : (
              defaultKeyLabel(RDS_KEY_SERVICE)
            ),
          },
          ...(database.MasterUserSecret?.KmsKeyId
            ? [
                {
                  label: "Secret encryption key",
                  value: <KeyLink value={database.MasterUserSecret.KmsKeyId} />,
                },
              ]
            : []),
        ]}
      />
    </Container>
  );
}

// Tên group là link sang trang CloudWatch Logs, kèm nút copy để dán vào code / CLI
export function LogsTab({ id }: { id: string }) {
  return (
    <Container
      header={
        <Header variant='h2' description="Floci writes the database's output to this log group.">
          Logs
        </Header>
      }
    >
      <KeyValuePairs
        items={[
          {
            label: "Log group",
            value: (
              <>
                <LogGroupLink name={errorLogGroup(id)} />{" "}
                <CopyButton variant='icon' text={errorLogGroup(id)} label={errorLogGroup(id)} />
              </>
            ),
          },
        ]}
      />
    </Container>
  );
}
