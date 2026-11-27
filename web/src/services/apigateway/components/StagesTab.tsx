import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { STAGES_DESCRIPTION, URL_LABELS } from "../constants.ts";
import { useStages, type StageRow } from "../hooks/useApiDetail.ts";
import { connectionsUrl, restInvokeUrl, webSocketUrl } from "../invokeUrl.ts";
import type { ApiVersion } from "../routes.ts";

interface Props {
  version: ApiVersion;
  apiId: string;
  websocket: boolean;
}

export function StagesTab({ version, apiId, websocket }: Props) {
  const stages = useStages(version, apiId);
  const { region, flociPublicUrl, flociInternalUrl } = useLoadedConfig();

  const urlsOf = (stage: string): [string, string][] =>
    websocket
      ? [
          [URL_LABELS.webSocket, webSocketUrl(flociPublicUrl, region, apiId, stage)],
          [URL_LABELS.connections, connectionsUrl(flociPublicUrl, apiId, stage)],
        ]
      : [
          [URL_LABELS.machine, restInvokeUrl(flociPublicUrl, apiId, stage)],
          [URL_LABELS.compose, restInvokeUrl(flociInternalUrl, apiId, stage)],
        ];

  const columns: TableProps.ColumnDefinition<StageRow>[] = [
    { id: "name", header: "Stage", isRowHeader: true, cell: (s) => s.name },
    {
      id: "urls",
      header: "Invoke URL",
      cell: (s) => (
        <SpaceBetween size='xxs'>
          {urlsOf(s.name).map(([label, url]) => (
            <div key={label}>
              <div>{label}</div>
              <CopyButton variant='inline' text={url} label={url} />
            </div>
          ))}
        </SpaceBetween>
      ),
    },
    { id: "deployment", header: "Deployment", cell: (s) => s.deploymentId ?? NOT_AVAILABLE },
    { id: "updated", header: "Updated", cell: (s) => formatDate(s.updated) },
  ];

  return (
    <Table
      variant='container'
      trackBy='name'
      items={stages.data ?? []}
      loading={stages.isLoading}
      loadingText='Loading stages'
      columnDefinitions={columns}
      empty={emptyOrError(stages, <EmptyState title='No stages' />)}
      header={
        <Header
          counter={stages.data ? `(${stages.data.length})` : undefined}
          description={STAGES_DESCRIPTION}
        >
          Stages
        </Header>
      }
    />
  );
}
