import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { DBInstance } from "@aws-sdk/client-rds";
import Header from "@cloudscape-design/components/header";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { CLUSTER_STATUS_STYLES } from "../constants.ts";
import { DeleteInstancesModal } from "./DeleteInstancesModal.tsx";

const ID_FIELD = "DBInstanceIdentifier";

const columns: TableProps.ColumnDefinition<DBInstance>[] = [
  { id: "id", header: "Instance", isRowHeader: true, cell: (row) => row.DBInstanceIdentifier },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.DBInstanceStatus} styles={CLUSTER_STATUS_STYLES} />,
  },
  { id: "class", header: "Class", cell: (row) => row.DBInstanceClass ?? NOT_AVAILABLE },
  { id: "endpoint", header: "Endpoint", cell: (row) => row.Endpoint?.Address ?? NOT_AVAILABLE },
];

interface Props {
  instances: DBInstance[];
  onAdd: () => void;
}

export function InstancesTab({ instances, onAdd }: Props) {
  const { ref, compact } = useIsCompact();
  const [deleting, setDeleting] = useState(false);
  const { items, collectionProps, actions } = useCollection(instances, {
    filtering: {
      empty: (
        <EmptyState
          title='No instances'
          description='On Floci the cluster works without instances; add one to match AWS.'
        />
      ),
    },
    selection: { trackBy: ID_FIELD },
  });
  const selected = collectionProps.selectedItems ?? [];

  const barActions: BarAction[] = [
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "add", text: "Add instance", primary: true, onClick: onAdd },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<DBInstance>(
          "instance",
          (row) => row.DBInstanceIdentifier ?? "",
        )}
        trackBy={ID_FIELD}
        items={items}
        columnDefinitions={columns}
        header={
          <Header
            counter={`(${instances.length})`}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Instances
          </Header>
        }
      />
      {deleting && (
        <DeleteInstancesModal
          ids={selected.map((row) => row.DBInstanceIdentifier ?? "")}
          onDismiss={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false);
            actions.setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
}
