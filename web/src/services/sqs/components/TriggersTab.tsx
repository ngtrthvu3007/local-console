import { useState } from "react";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EVENT_SOURCE_STATES, FUNCTION_TABS } from "@localconsole/core/lambda";
import { BrokenTriggersAlert } from "../../lambda/components/BrokenTriggersAlert.tsx";
import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { useQueueTriggers } from "../hooks/useQueueTriggers.ts";
import type { Queue } from "@localconsole/core/sqs";
import { AddTriggerModal } from "./AddTriggerModal.tsx";

// Chỉ xem và thêm; bật/tắt, xóa làm ở tab Triggers của Lambda (giống DynamoDB)
export function TriggersTab({ queue }: { queue: Queue }) {
  const { ref, compact } = useIsCompact();
  const triggers = useQueueTriggers(queue);
  const [adding, setAdding] = useState(false);

  const columns: TableProps.ColumnDefinition<EventSourceMappingConfiguration>[] = [
    {
      id: "function",
      header: "Function",
      isRowHeader: true,
      cell: (mapping) => (
        <FunctionLink arn={mapping.FunctionArn ?? ""} tab={FUNCTION_TABS.triggers} />
      ),
    },
    {
      id: "batch-size",
      header: <FigureHeader>Batch size</FigureHeader>,
      cell: (mapping) => <Figure>{mapping.BatchSize}</Figure>,
    },
    {
      id: "state",
      header: "State",
      cell: (mapping) => (
        <StatusIndicator
          type={mapping.State === EVENT_SOURCE_STATES.enabled ? "success" : "stopped"}
        >
          {mapping.State}
        </StatusIndicator>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(triggers),
    { id: "add", text: "Add trigger", primary: true, onClick: () => setAdding(true) },
  ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <BrokenTriggersAlert mappings={triggers.data ?? []} onRemoved={triggers.refetch} />
        <Table
          variant='container'
          items={triggers.data ?? []}
          trackBy='UUID'
          loading={triggers.isLoading}
          loadingText='Loading Lambda triggers'
          columnDefinitions={columns}
          wrapLines
          empty={emptyOrError(
            triggers,
            <EmptyState
              title='No Lambda triggers'
              description='No function reads this queue yet.'
            />,
          )}
          header={
            <Header
              counter={triggers.data ? `(${triggers.data.length})` : undefined}
              description='Functions that run when messages arrive in this queue.'
              actions={<ActionBar compact={compact} actions={barActions} />}
            >
              Lambda triggers
            </Header>
          }
        />
      </SpaceBetween>
      {adding && <AddTriggerModal queue={queue} onDismiss={() => setAdding(false)} />}
    </div>
  );
}
