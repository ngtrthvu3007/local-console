import { useState } from "react";
import type { DataSource } from "@aws-sdk/client-appsync";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { usedByText } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { TableLink } from "../../dynamodb/components/TableLink.tsx";
import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { DATA_SOURCE_LABELS, DATA_SOURCE_TYPES, isDataSourceKind } from "../constants.ts";
import { useApiUsage } from "../hooks/useApiUsage.ts";
import { useDataSources, useDeleteDataSource } from "../hooks/useDataSources.ts";
import { DataSourceModal } from "./DataSourceModal.tsx";

const MENU = { edit: "edit", delete: "delete" } as const;
type Modal = "create" | (typeof MENU)[keyof typeof MENU];

function ResourceCell({ dataSource }: { dataSource: DataSource }) {
  const table = dataSource.dynamodbConfig?.tableName;
  const functionArn = dataSource.lambdaConfig?.lambdaFunctionArn;
  if (dataSource.type === DATA_SOURCE_TYPES.dynamodb && table) return <TableLink name={table} />;
  if (dataSource.type === DATA_SOURCE_TYPES.lambda && functionArn)
    return <FunctionLink arn={functionArn} />;
  return <>{NOT_AVAILABLE}</>;
}

export function DataSourcesTab({ apiId, compact }: { apiId: string; compact: boolean }) {
  const dataSources = useDataSources(apiId);
  const usage = useApiUsage(apiId);
  const remove = useDeleteDataSource(apiId);
  const [selected, setSelected] = useState<DataSource[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const items = dataSources.data ?? [];
  // Lấy bản mới nhất của dòng đang chọn sau khi bảng tải lại
  const target = items.find((dataSource) => dataSource.name === selected[0]?.name);
  const usedBy = target ? (usage.dataSources.get(target.name ?? "") ?? []) : [];

  const barActions: BarAction[] = [
    { id: "create", text: "Create data source", primary: true, onClick: () => setModal("create") },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    {
      id: MENU.edit,
      text: "Edit",
      // HTTP / RDS do CDK tạo: form không có các loại này, lưu sẽ đổi loại data source
      disabled: !target || !isDataSourceKind(target.type),
      disabledReason:
        target && !isDataSourceKind(target.type) ? "Edit this data source with CDK." : undefined,
    },
    {
      id: MENU.delete,
      text: "Delete",
      disabled: !target || usage.loading || usedBy.length > 0 || remove.isPending,
      // Floci cho xóa rồi query lỗi (spec 7 #8)
      disabledReason: usedByText(usedBy),
    },
  ];

  const close = () => setModal(null);
  const confirmDelete = () =>
    remove.mutate(
      target?.name ?? "",
      notifyOutcome({
        success: `Deleted data source ${target?.name}`,
        errorHeader: "Couldn't delete data source",
        then: () => {
          close();
          setSelected([]);
        },
      }),
    );

  const existingNames = items.flatMap(({ name }) => (name ? [name] : []));

  return (
    <>
      <Table
        items={items}
        trackBy='name'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<DataSource>(
          "data source",
          (dataSource) => dataSource.name ?? "",
        )}
        loading={dataSources.isLoading}
        loadingText='Loading data sources'
        wrapLines={compact}
        header={
          <Header
            counter={dataSources.data ? `(${items.length})` : undefined}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(itemId) =>
                  setModal(itemId === MENU.edit ? MENU.edit : MENU.delete)
                }
              />
            }
          >
            Data sources
          </Header>
        }
        columnDefinitions={[
          { id: "name", header: "Name", isRowHeader: true, cell: (dataSource) => dataSource.name },
          {
            id: "type",
            header: "Type",
            cell: (dataSource) => DATA_SOURCE_LABELS[dataSource.type ?? ""] ?? dataSource.type,
          },
          {
            id: "resource",
            header: "Resource",
            cell: (dataSource) => <ResourceCell dataSource={dataSource} />,
          },
        ]}
        empty={emptyOrError(
          dataSources,
          <EmptyState
            title='No data sources'
            description='Connect a DynamoDB table or a Lambda function.'
          />,
        )}
      />
      {modal === "create" && (
        <DataSourceModal apiId={apiId} existingNames={existingNames} onDismiss={close} />
      )}
      {target && modal === MENU.edit && (
        <DataSourceModal
          apiId={apiId}
          existingNames={existingNames}
          dataSource={target}
          onDismiss={close}
        />
      )}
      <ConfirmModal
        visible={Boolean(target) && modal === MENU.delete}
        header={`Delete data source ${target?.name}?`}
        actionText='Delete'
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onDismiss={close}
      />
    </>
  );
}
