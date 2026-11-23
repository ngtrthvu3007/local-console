import type { Output } from "@aws-sdk/client-cloudformation";
import Header from "@cloudscape-design/components/header";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";

const columns: TableProps.ColumnDefinition<Output>[] = [
  { id: "key", header: "Key", isRowHeader: true, cell: (output) => output.OutputKey },
  {
    id: "value",
    header: "Value",
    cell: (output) => (
      <span>
        <BreakableText text={output.OutputValue ?? ""} />{" "}
        <CopyButton variant='icon' label={`Copy ${output.OutputKey}`} text={output.OutputValue} />
      </span>
    ),
  },
  { id: "export", header: "Export name", cell: (output) => output.ExportName ?? NOT_AVAILABLE },
];

export function OutputsTab({ outputs }: { outputs: Output[] }) {
  return (
    <Table
      variant='container'
      trackBy='OutputKey'
      items={outputs}
      columnDefinitions={columns}
      wrapLines
      empty={<EmptyState title='No outputs' />}
      header={<Header counter={`(${outputs.length})`}>Outputs</Header>}
    />
  );
}
