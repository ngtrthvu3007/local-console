import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import {
  API_TYPES,
  STAGES_DESCRIPTION,
  URL_LABELS,
  connectionsUrl,
  restInvokeUrl,
  webSocketUrl,
  type StageRow,
  type ApiType,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useStages } from "../hooks/useApiDetail.ts";
import { CreateStageModal, DeleteStageModal } from "./StageModals.tsx";

interface Props {
  version: ApiVersion;
  apiId: string;
  apiType: ApiType;
}

export function StagesTab({ version, apiId, apiType }: Props) {
  const stages = useStages(version, apiId);
  const { region, flociPublicUrl, flociInternalUrl } = useLoadedConfig();
  const [selected, setSelected] = useState<StageRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const websocket = apiType === API_TYPES.websocket;
  const target = selected[0]?.name;

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
    <>
      <Table
        variant='container'
        trackBy='name'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<StageRow>("stage", (stage) => stage.name)}
        items={stages.data ?? []}
        loading={stages.isLoading}
        loadingText='Loading stages'
        columnDefinitions={columns}
        empty={emptyOrError(stages, <EmptyState title='No stages' />)}
        header={
          <Header
            counter={stages.data ? `(${stages.data.length})` : undefined}
            description={STAGES_DESCRIPTION}
            actions={
              <SpaceBetween size='xs' direction='horizontal'>
                <Button disabled={!target} onClick={() => setDeleting(true)}>
                  Delete
                </Button>
                <Button onClick={() => setCreating(true)}>Create stage</Button>
              </SpaceBetween>
            }
          >
            Stages
          </Header>
        }
      />
      {creating && (
        <CreateStageModal
          version={version}
          apiId={apiId}
          apiType={apiType}
          existing={(stages.data ?? []).map((stage) => stage.name)}
          onDismiss={() => setCreating(false)}
        />
      )}
      {deleting && target && (
        <DeleteStageModal
          version={version}
          apiId={apiId}
          name={target}
          onDismiss={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false);
            setSelected([]);
          }}
        />
      )}
    </>
  );
}
