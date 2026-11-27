import { useState } from "react";
import type { TaskDefinition } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Select from "@cloudscape-design/components/select";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Toggle from "@cloudscape-design/components/toggle";
import Table from "@shared/components/ResponsiveTable.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { ViewInLogsLink } from "../../logs/components/LogGroupLink.tsx";
import { logsRoutes } from "@localconsole/core/logs";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { logEventColumns } from "@shared/logs/columns.tsx";
import { awslogsTarget } from "@localconsole/core/ecs";
import { NO_AWSLOGS_TEXT } from "../constants.ts";
import { useTaskLogs } from "../hooks/useTaskLogs.ts";

interface Props {
  taskId: string;
  definition?: TaskDefinition;
  loading: boolean; // task definition còn đang tải: chưa biết container nào ghi log
}

// Log CloudWatch của từng container ghi bằng awslogs (stream "<prefix>/<container>/<task ID>")
export function TaskLogsTab({ taskId, definition, loading }: Props) {
  const targets = (definition?.containerDefinitions ?? []).flatMap((container) => {
    const target = awslogsTarget(container, taskId);
    return target ? [{ name: container.name ?? "", ...target }] : [];
  });
  const [containerName, setContainerName] = useState<string | undefined>(targets[0]?.name);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const target = targets.find((candidate) => candidate.name === containerName) ?? targets[0];
  const logs = useTaskLogs(target, autoRefresh);

  if (loading) {
    return (
      <Box textAlign='center' padding='l'>
        <StatusIndicator type='loading'>Loading</StatusIndicator>
      </Box>
    );
  }

  if (!targets.length) {
    return (
      <Box textAlign='center' color='text-body-secondary' padding='l'>
        {NO_AWSLOGS_TEXT}
      </Box>
    );
  }

  const options = targets.map((candidate) => ({ value: candidate.name, label: candidate.name }));

  return (
    <Table
      items={logs.data ?? []}
      loading={logs.isLoading}
      loadingText='Loading logs'
      columnDefinitions={logEventColumns}
      wrapLines
      empty={emptyOrError(
        logs,
        <EmptyState
          title='No logs yet'
          description='The container hasn’t written anything to CloudWatch Logs.'
        />,
      )}
      header={
        <Header
          description={target && `${target.group} › ${target.stream}`}
          actions={
            <ResponsiveActions>
              {target && <ViewInLogsLink href={logsRoutes.stream(target.group, target.stream)} />}
              <Toggle
                checked={autoRefresh}
                onChange={({ detail }) => setAutoRefresh(detail.checked)}
              >
                Auto refresh
              </Toggle>
              <Button
                iconName='refresh'
                ariaLabel='Refresh logs'
                loading={logs.isFetching}
                onClick={() => logs.refetch()}
              />
            </ResponsiveActions>
          }
        >
          Logs
        </Header>
      }
      filter={
        targets.length > 1 && (
          <Select
            selectedOption={options.find((option) => option.value === target?.name) ?? null}
            options={options}
            onChange={({ detail }) => setContainerName(detail.selectedOption.value)}
            ariaLabel='Container'
          />
        )
      }
    />
  );
}
