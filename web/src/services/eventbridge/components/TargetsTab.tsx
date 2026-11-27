import { useState } from "react";
import type { Target } from "@aws-sdk/client-eventbridge";
import Header from "@cloudscape-design/components/header";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { pluralize, lastArnPart } from "@localconsole/core/shared";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useRemoveTargets, useTargets } from "../hooks/useTargets.ts";
import { TARGET_KINDS, targetKindOfArn } from "@localconsole/core/eventbridge";
import { AddTargetModal } from "./AddTargetModal.tsx";
import { TargetResource } from "./TargetResource.tsx";

const ID_FIELD = "Id";

const columns: TableProps.ColumnDefinition<Target>[] = [
  {
    id: "type",
    header: "Type",
    isRowHeader: true,
    cell: (target) => TARGET_KINDS[targetKindOfArn(target.Arn ?? "")],
  },
  {
    id: "resource",
    header: "Resource",
    cell: (target) => (
      <TargetResource
        arn={target.Arn ?? ""}
        ecsTaskDefinition={target.EcsParameters?.TaskDefinitionArn}
      />
    ),
  },
];

export function TargetsTab({ bus, rule }: { bus: string; rule: string }) {
  const { compact } = useIsCompact();
  const targets = useTargets(bus, rule);
  const removeTargets = useRemoveTargets(bus, rule);
  const [selected, setSelected] = useState<Target[]>([]);
  const [modal, setModal] = useState<"add" | "remove" | null>(null);

  const remove = () =>
    removeTargets.mutate(
      selected.map((target) => target.Id ?? ""),
      notifyOutcome({
        success: `Removed ${pluralize(selected.length, "target")}`,
        errorHeader: "Couldn't remove",
        then: () => {
          setModal(null);
          setSelected([]);
        },
      }),
    );

  const barActions: BarAction[] = [
    refreshAction(targets),
    { id: "remove", text: "Remove", disabled: !selected.length, onClick: () => setModal("remove") },
    { id: "add", text: "Add target", primary: true, onClick: () => setModal("add") },
  ];

  return (
    <>
      <Table
        variant='container'
        items={targets.data ?? []}
        trackBy={ID_FIELD}
        selectionType='multi'
        ariaLabels={selectionLabels<Target>("target", (target) => target.Id ?? "")}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={targets.isLoading}
        loadingText='Loading targets'
        columnDefinitions={columns}
        wrapLines
        empty={emptyOrError(
          targets,
          <EmptyState title='No targets' description='This rule has nowhere to send events.' />,
        )}
        header={
          <Header
            counter={targets.data ? `(${targets.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Targets
          </Header>
        }
      />
      {modal === "add" && <AddTargetModal bus={bus} rule={rule} onDismiss={() => setModal(null)} />}
      <ConfirmModal
        visible={modal === "remove"}
        header={`Remove ${pluralize(selected.length, "target")}?`}
        actionText='Remove'
        loading={removeTargets.isPending}
        onDismiss={() => setModal(null)}
        onConfirm={remove}
      >
        {selected.map((target) => lastArnPart(target.Arn ?? "")).join(", ")}
      </ConfirmModal>
    </>
  );
}
