import { useState } from "react";
import type { Distribution } from "@aws-sdk/client-cloudfront";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CodeSamples } from "@shared/components/CodeSamples.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { distributionSample } from "../codeSamples.ts";
import { errorResponsesOf, isSpa, localUrl } from "../distributions.ts";
import { SettingsModal } from "./SettingsModal.tsx";

const DETAILS_COLUMNS = 2;
const SETTINGS_COLUMNS = 3;

export function GeneralTab({
  distribution,
  compact,
}: {
  distribution: Distribution;
  compact: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { flociPublicUrl } = useLoadedConfig();
  const id = distribution.Id ?? "";
  const arn = distribution.ARN ?? "";
  const domain = distribution.DomainName ?? "";
  const config = distribution.DistributionConfig;
  const url = localUrl(flociPublicUrl, id);
  const errorPages = config ? errorResponsesOf(config) : [];

  return (
    <SpaceBetween size='l'>
      <Container header={<Header variant='h2'>Details</Header>}>
        <KeyValuePairs
          columns={compact ? 1 : DETAILS_COLUMNS}
          items={[
            { label: "Distribution ID", value: copyable(id) },
            { label: "ARN", value: copyable(arn) },
            {
              label: "Domain name",
              value: (
                <div>
                  {copyable(domain)}
                  <Box variant='small' display='block' color='text-body-secondary'>
                    AWS name. On Floci, use the local URL.
                  </Box>
                </div>
              ),
            },
            { label: "Last modified", value: formatDate(distribution.LastModifiedTime) },
          ]}
        />
      </Container>
      <Container
        header={
          <Header
            variant='h2'
            description="URL for your app, on your machine. Works from your machine (browser, curl, your app). Containers in compose can't resolve this name."
          >
            Connect
          </Header>
        }
      >
        <SpaceBetween size='m'>
          <KeyValuePairs
            items={[
              {
                label: "Local URL",
                value: (
                  <SpaceBetween size='xs' direction='horizontal' alignItems='center'>
                    {copyable(url)}
                    <Link href={url} external>
                      Open
                    </Link>
                  </SpaceBetween>
                ),
              },
            ]}
          />
          <CodeSamples sample={distributionSample(id)} />
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header variant='h2' actions={<Button onClick={() => setEditing(true)}>Edit</Button>}>
            Settings
          </Header>
        }
      >
        <KeyValuePairs
          columns={compact ? 1 : SETTINGS_COLUMNS}
          items={[
            { label: "Description", value: config?.Comment || NOT_AVAILABLE },
            { label: "Default root object", value: config?.DefaultRootObject || NOT_AVAILABLE },
            { label: "Single-page app", value: config && isSpa(config) ? "On" : "Off" },
          ]}
        />
      </Container>
      <Table
        items={errorPages}
        trackBy='ErrorCode'
        header={<Header counter={`(${errorPages.length})`}>Error pages</Header>}
        columnDefinitions={[
          {
            id: "code",
            header: "HTTP error code",
            isRowHeader: true,
            cell: (page) => String(page.ErrorCode ?? ""),
          },
          {
            id: "path",
            header: "Response page path",
            cell: (page) => page.ResponsePagePath || NOT_AVAILABLE,
          },
          {
            id: "response",
            header: "Response code",
            cell: (page) => page.ResponseCode || NOT_AVAILABLE,
          },
        ]}
        empty={<EmptyState title='No error pages' />}
      />
      {editing && config && (
        <SettingsModal id={id} config={config} onDismiss={() => setEditing(false)} />
      )}
    </SpaceBetween>
  );
}
