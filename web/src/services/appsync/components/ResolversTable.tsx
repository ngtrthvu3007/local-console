import { useState } from "react";
import { useNavigate } from "react-router";
import type { Resolver } from "@aws-sdk/client-appsync";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import Select from "@cloudscape-design/components/select";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import {
  fieldLabel,
  runtimeLabel,
  type ResolverRow,
  RESOLVER_KINDS,
  appsyncRoutes,
} from "@localconsole/core/appsync";
import { useDeleteResolver } from "../hooks/useResolvers.ts";

const ALL_TYPES = "";
const MENU = { edit: "edit", delete: "delete" } as const;

function resolverLabel(resolver?: Resolver) {
  if (!resolver) return NOT_AVAILABLE;
  if (resolver.kind === RESOLVER_KINDS.pipeline)
    return `Pipeline (${resolver.pipelineConfig?.functions?.length ?? 0} functions)`;
  return resolver.dataSourceName ?? NOT_AVAILABLE;
}

interface Props {
  apiId: string;
  rows: ResolverRow[];
  loading: boolean;
  compact: boolean;
}

export function ResolversTable({ apiId, rows, loading, compact }: Props) {
  const navigate = useNavigate();
  const remove = useDeleteResolver(apiId);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [selected, setSelected] = useState<ResolverRow[]>([]);
  const [deleting, setDeleting] = useState(false);
  const types = [...new Set(rows.map((row) => row.typeName))];
  const items = rows.filter((row) => typeFilter === ALL_TYPES || row.typeName === typeFilter);
  // Lấy bản mới nhất của dòng đang chọn sau khi bảng tải lại
  const target = rows.find((row) => fieldLabel(row) === (selected[0] && fieldLabel(selected[0])));
  const open = (row: ResolverRow) =>
    navigate(appsyncRoutes.resolver(apiId, row.typeName, row.fieldName));

  const barActions: BarAction[] = [
    {
      id: "attach",
      text: "Attach resolver",
      primary: true,
      disabled: !target || Boolean(target.resolver),
      disabledReason: target?.resolver ? "This field has a resolver: edit it." : "Choose a field.",
      onClick: () => target && open(target),
    },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MENU.edit, text: "Edit", disabled: !target?.resolver },
    { id: MENU.delete, text: "Delete", disabled: !target?.resolver || remove.isPending },
  ];

  const onMenuItemClick = (itemId: string) => {
    if (!target) return;
    if (itemId === MENU.edit) open(target);
    else if (itemId === MENU.delete) setDeleting(true);
  };

  const confirmDelete = () =>
    target &&
    remove.mutate(
      { typeName: target.typeName, fieldName: target.fieldName },
      notifyOutcome({
        success: `Deleted resolver ${fieldLabel(target)}`,
        errorHeader: "Couldn't delete resolver",
        then: () => {
          setDeleting(false);
          setSelected([]);
        },
      }),
    );

  const typeOptions = [
    { value: ALL_TYPES, label: "All types" },
    ...types.map((type) => ({ value: type, label: type })),
  ];

  return (
    <>
      <Table
        items={items}
        trackBy={fieldLabel}
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<ResolverRow>("field", fieldLabel)}
        loading={loading}
        loadingText='Loading resolvers'
        wrapLines={compact}
        filter={
          <Select
            selectedOption={typeOptions.find((option) => option.value === typeFilter) ?? null}
            options={typeOptions}
            onChange={({ detail }) => setTypeFilter(detail.selectedOption.value ?? ALL_TYPES)}
            ariaLabel='Filter by type'
          />
        }
        header={
          <Header
            counter={`(${rows.filter((row) => row.resolver).length})`}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={onMenuItemClick}
              />
            }
          >
            Resolvers
          </Header>
        }
        columnDefinitions={[
          { id: "type", header: "Type", cell: (row) => row.typeName },
          {
            id: "field",
            header: "Field",
            isRowHeader: true,
            cell: (row) =>
              row.notInSchema ? (
                <StatusIndicator type='warning'>{row.fieldName} (not in schema)</StatusIndicator>
              ) : (
                row.fieldName
              ),
          },
          { id: "resolver", header: "Resolver", cell: (row) => resolverLabel(row.resolver) },
          { id: "runtime", header: "Runtime", cell: (row) => runtimeLabel(row.resolver) },
        ]}
        empty={
          <EmptyState title='No fields' description='Add Query or Mutation fields to the schema.' />
        }
      />
      <ConfirmModal
        visible={deleting && Boolean(target)}
        header={`Delete resolver ${target ? fieldLabel(target) : ""}?`}
        actionText='Delete'
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onDismiss={() => setDeleting(false)}
      >
        The field returns null until it has a resolver again.
      </ConfirmModal>
    </>
  );
}
