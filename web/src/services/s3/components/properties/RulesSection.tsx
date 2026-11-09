import { useState, type ReactNode } from "react";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { EmptyState, emptyOrError, type FailableQuery } from "@shared/components/TableStates.tsx";

export interface CreateModalProps<TRule> {
  existingIds: string[];
  onCreate: (rule: TRule, success: string) => void;
  onDismiss: () => void;
}

interface Props<TRule> {
  title: string; // vd: "Lifecycle rules"; dùng cả cho thông báo xóa
  description: string;
  createText: string;
  empty: { title: string; description?: string };
  rules: TRule[];
  query: FailableQuery & { isLoading: boolean };
  ruleId: (rule: TRule) => string;
  columns: TableProps.ColumnDefinition<TRule>[];
  saving: boolean;
  // Ghi lại cả danh sách (S3 không có API sửa từng rule); `then` chạy khi lưu xong
  save: (rules: TRule[], success: string, then: () => void) => void;
  createModal: (props: CreateModalProps<TRule>) => ReactNode;
}

// Bảng các rule cấu hình của bucket (event notification, lifecycle…): tạo và xóa
export function RulesSection<TRule>(props: Props<TRule>) {
  const { title, description, createText, empty, rules, query, ruleId, columns } = props;
  const { saving, save, createModal } = props;
  const [selected, setSelected] = useState<TRule[]>([]);
  const [modal, setModal] = useState<"create" | "delete" | null>(null);
  const selectedIds = selected.map(ruleId);
  const lowerTitle = title.toLowerCase();

  const finish = () => {
    setModal(null);
    setSelected([]);
  };
  const create = (rule: TRule, success: string) => save([...rules, rule], success, finish);
  const deleteSelected = () =>
    save(
      rules.filter((rule) => !selectedIds.includes(ruleId(rule))),
      `Deleted ${lowerTitle}`,
      finish,
    );

  const headerActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button disabled={!selected.length} onClick={() => setModal("delete")}>
        Delete
      </Button>
      <Button onClick={() => setModal("create")}>{createText}</Button>
    </SpaceBetween>
  );

  const header = (
    <Header counter={`(${rules.length})`} description={description} actions={headerActions}>
      {title}
    </Header>
  );

  return (
    <>
      <Table
        variant='container'
        items={rules}
        trackBy={ruleId}
        selectionType='multi'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={query.isLoading}
        loadingText={`Loading ${lowerTitle}`}
        columnDefinitions={columns}
        wrapLines
        empty={emptyOrError(query, <EmptyState {...empty} />)}
        header={header}
      />
      {modal === "create" &&
        createModal({
          existingIds: rules.map(ruleId),
          onCreate: create,
          onDismiss: () => setModal(null),
        })}
      <ConfirmModal
        visible={modal === "delete"}
        header={`Delete ${lowerTitle}?`}
        actionText='Delete'
        loading={saving}
        onDismiss={() => setModal(null)}
        onConfirm={deleteSelected}
      >
        {selectedIds.join(", ")}
      </ConfirmModal>
    </>
  );
}
