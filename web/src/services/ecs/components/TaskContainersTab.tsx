import type { Container as TaskContainer, Task } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { TASK_STATUS_STYLES } from "../constants.ts";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";

interface Row {
  container: TaskContainer;
  command?: string[];
  environment: string[];
}

const code = (text?: string) => (text ? <Box variant='code'>{text}</Box> : NOT_AVAILABLE);

// Container của task kèm command / env đã ghi đè khi Run task (overrides)
export function TaskContainersTab({ task }: { task: Task }) {
  const overrides = task.overrides?.containerOverrides ?? [];
  const rows: Row[] = (task.containers ?? []).map((container) => {
    const override = overrides.find((candidate) => candidate.name === container.name);
    return {
      container,
      command: override?.command,
      environment: (override?.environment ?? []).map((env) => `${env.name}=${env.value}`),
    };
  });

  const columns: TableProps.ColumnDefinition<Row>[] = [
    { id: "name", header: "Container", isRowHeader: true, cell: (row) => row.container.name },
    {
      id: "status",
      header: "Last status",
      cell: (row) => <StatusBadge status={row.container.lastStatus} styles={TASK_STATUS_STYLES} />,
    },
    { id: "exit", header: "Exit code", cell: (row) => row.container.exitCode ?? NOT_AVAILABLE },
    { id: "reason", header: "Reason", cell: (row) => row.container.reason ?? NOT_AVAILABLE },
    { id: "image", header: "Image", cell: (row) => row.container.image ?? NOT_AVAILABLE },
    {
      id: "command",
      header: "Command override",
      cell: (row) => code(row.command && JSON.stringify(row.command)),
    },
    {
      id: "environment",
      header: "Environment override",
      cell: (row) => code(row.environment.join("\n")),
    },
  ];

  return (
    <Table
      items={rows}
      trackBy={(row) => row.container.name ?? ""}
      columnDefinitions={columns}
      wrapLines
      header={<Header counter={`(${rows.length})`}>Containers</Header>}
    />
  );
}
