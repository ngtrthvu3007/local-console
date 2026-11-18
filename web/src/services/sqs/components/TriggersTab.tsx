import { useState } from "react";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EVENT_SOURCE_STATES } from "../../lambda/constants.ts";
import { functionNameOfMapping } from "../../lambda/helpers.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../../lambda/routes.ts";
import { useQueueTriggers } from "../hooks/useQueueTriggers.ts";
import type { Queue } from "../queues.ts";
import { AddTriggerModal } from "./AddTriggerModal.tsx";

// Chỉ xem và thêm; bật/tắt, xóa làm ở tab Triggers của Lambda (giống DynamoDB)
export function TriggersTab({ queue }: { queue: Queue }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const triggers = useQueueTriggers(queue);
  const [adding, setAdding] = useState(false);

  const columns: TableProps.ColumnDefinition<EventSourceMappingConfiguration>[] = [
    {
      id: "function",
      header: "Function",
      isRowHeader: true,
      cell: (mapping) => (
        <Link
          href={lambdaRoutes.function(functionNameOfMapping(mapping), FUNCTION_TABS.triggers)}
          onFollow={follow}
        >
          {functionNameOfMapping(mapping)}
        </Link>
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
          <EmptyState title='No Lambda triggers' description='No function reads this queue yet.' />,
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
      {adding && <AddTriggerModal queue={queue} onDismiss={() => setAdding(false)} />}
    </div>
  );
}
