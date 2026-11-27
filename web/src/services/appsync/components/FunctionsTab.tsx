import { useState } from "react";
import { useNavigate } from "react-router";
import type { FunctionConfiguration } from "@aws-sdk/client-appsync";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, usedByText } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { runtimeLabel, appsyncRoutes } from "@localconsole/core/appsync";
import { useApiUsage } from "../hooks/useApiUsage.ts";
import { useApiFunctions, useDeleteFunction } from "../hooks/useFunctions.ts";

const MENU = { edit: "edit", delete: "delete" } as const;
const LIST_SEPARATOR = ", ";

export function FunctionsTab({ apiId, compact }: { apiId: string; compact: boolean }) {
  const navigate = useNavigate();
  const functions = useApiFunctions(apiId);
  const usage = useApiUsage(apiId);
  const remove = useDeleteFunction(apiId);
  const [selected, setSelected] = useState<FunctionConfiguration[]>([]);
  const [deleting, setDeleting] = useState(false);
  const items = functions.data ?? [];
  const target = items.find((fn) => fn.functionId === selected[0]?.functionId);
  const usedBy = target ? (usage.functions.get(target.functionId ?? "") ?? []) : [];

  const barActions: BarAction[] = [
    {
      id: "create",
      text: "Create function",
      primary: true,
      onClick: () => navigate(appsyncRoutes.createFunction(apiId)),
    },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MENU.edit, text: "Edit", disabled: !target },
    {
      id: MENU.delete,
      text: "Delete",
      disabled: !target || usage.loading || usedBy.length > 0 || remove.isPending,
      // Floci cho xóa rồi query của pipeline lỗi (spec 7 #8)
      disabledReason: usedByText(usedBy),
    },
  ];

  const onMenuItemClick = (itemId: string) => {
    if (!target?.functionId) return;
    if (itemId === MENU.edit) navigate(appsyncRoutes.function(apiId, target.functionId));
    else if (itemId === MENU.delete) setDeleting(true);
  };

  const confirmDelete = () =>
    remove.mutate(
      target?.functionId ?? "",
      notifyOutcome({
        success: `Deleted function ${target?.name}`,
        errorHeader: "Couldn't delete function",
        then: () => {
          setDeleting(false);
          setSelected([]);
        },
      }),
    );

  return (
    <>
      <Table
        items={items}
        trackBy='functionId'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<FunctionConfiguration>("function", (fn) => fn.name ?? "")}
        loading={functions.isLoading}
        loadingText='Loading functions'
        wrapLines={compact}
        header={
          <Header
            counter={functions.data ? `(${items.length})` : undefined}
            description='Steps of pipeline resolvers.'
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={onMenuItemClick}
              />
            }
          >
            Functions
          </Header>
        }
        columnDefinitions={[
          { id: "name", header: "Name", isRowHeader: true, cell: (fn) => fn.name },
          {
            id: "dataSource",
            header: "Data source",
            cell: (fn) => fn.dataSourceName ?? NOT_AVAILABLE,
          },
          {
            id: "runtime",
            header: "Runtime",
            cell: (fn) => runtimeLabel(fn),
          },
          {
            id: "usedBy",
            header: "Used by",
            cell: (fn) =>
              usage.functions.get(fn.functionId ?? "")?.join(LIST_SEPARATOR) ?? NOT_AVAILABLE,
          },
        ]}
        empty={emptyOrError(
          functions,
          <EmptyState
            title='No functions'
            description='Create one to use in a pipeline resolver.'
          />,
        )}
      />
      <ConfirmModal
        visible={deleting && Boolean(target)}
        header={`Delete function ${target?.name}?`}
        actionText='Delete'
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onDismiss={() => setDeleting(false)}
      />
    </>
  );
}
