import { useState, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import type { KeyUpdate, KeyValue } from "@server/routes/redis/contract.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { PANEL_LIST_WIDTH_PX, VALUE_PREVIEW_MAX_LENGTH } from "../constants.ts";
import { useUpdateKey, type KeyValueQuery } from "../hooks/useRedis.ts";
import type { CollectionKind } from "../schemas.ts";
import { ElementModal, type ElementTarget } from "./ElementModal.tsx";

type CollectionValue = Extract<KeyValue, { kind: CollectionKind }>;

// primary: field/value/member chính của dòng; secondary: value (hash), index, score
interface Row extends ElementTarget {
  id: string;
  primary: string;
  secondary?: string;
}

interface KindConfig {
  title: string;
  noun: string;
  addText: string;
  editable: boolean;
  columns: { primary: string; secondary?: string; numeric?: boolean };
  deleteUpdate: (rows: Row[]) => KeyUpdate;
}

const KIND_CONFIGS: Record<CollectionKind, KindConfig> = {
  hash: {
    title: "Fields",
    noun: "field",
    addText: "Add field",
    editable: true,
    columns: { primary: "Field", secondary: "Value" },
    deleteUpdate: (rows) => ({ operation: "deleteFields", fields: rows.map((row) => row.field!) }),
  },
  list: {
    title: "Elements",
    noun: "element",
    addText: "Push",
    editable: true,
    columns: { primary: "Value", secondary: "Index", numeric: true },
    deleteUpdate: (rows) => ({
      operation: "deleteIndexes",
      indexes: rows.map((row) => row.index!),
    }),
  },
  set: {
    title: "Members",
    noun: "member",
    addText: "Add member",
    editable: false,
    columns: { primary: "Member" },
    deleteUpdate: (rows) => ({
      operation: "deleteMembers",
      members: rows.map((row) => row.member!),
    }),
  },
  zset: {
    title: "Members",
    noun: "member",
    addText: "Add member",
    editable: true,
    columns: { primary: "Member", secondary: "Score", numeric: true },
    deleteUpdate: (rows) => ({
      operation: "deleteScoredMembers",
      members: rows.map((row) => row.member!),
    }),
  },
};

function rowsOf(value: CollectionValue): Row[] {
  switch (value.kind) {
    case "hash":
      return value.items.map((entry) => ({
        id: entry.field,
        primary: entry.field,
        secondary: entry.value,
        ...entry,
      }));
    case "list":
      return value.items.map((element) => ({
        id: String(element.index),
        primary: element.value,
        secondary: String(element.index),
        ...element,
      }));
    case "set":
      return value.items.map((member) => ({ id: member, primary: member, member }));
    case "zset":
      return value.items.map((entry) => ({
        id: entry.member,
        primary: entry.member,
        secondary: entry.score,
        ...entry,
      }));
  }
}

const preview = (text = "") => text.slice(0, VALUE_PREVIEW_MAX_LENGTH);
// Value dài chỉ hiện một dòng, cắt bằng "…"
const oneLineStyle = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

interface Props {
  cluster: string;
  name: string;
  value: CollectionValue;
  query: KeyValueQuery; // để Load more và làm mới
}

type Modal = { id: "add" } | { id: "edit"; row: Row } | { id: "delete" };

export function CollectionTable(props: Props) {
  const { cluster, name, value, query } = props;
  const kind = value.kind;
  const config = KIND_CONFIGS[kind];
  const { ref, compact } = useIsCompact(PANEL_LIST_WIDTH_PX);
  const updateKey = useUpdateKey(cluster, name);
  const [selected, setSelected] = useState<Row[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const closeModal = () => setModal(null);
  const rows = rowsOf(value);
  const single = selected.length === 1 ? selected[0] : undefined;

  const openEdit = (row: Row) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    setModal({ id: "edit", row });
  };

  // Bấm vào giá trị để sửa (set không sửa được, chỉ thêm/xóa)
  const editable = (row: Row, children: ReactNode) =>
    config.editable ? (
      <Link href='#' onFollow={openEdit(row)}>
        {children}
      </Link>
    ) : (
      children
    );

  const wideColumns: TableProps.ColumnDefinition<Row>[] = [
    {
      id: "primary",
      header: config.columns.primary,
      isRowHeader: true,
      // Hash: sửa value nên link nằm ở cột value; list: link ở chính value
      cell: (row) => (kind === "hash" ? row.primary : editable(row, preview(row.primary))),
    },
    ...(config.columns.secondary
      ? [
          {
            id: "secondary",
            header: config.columns.numeric ? (
              <FigureHeader>{config.columns.secondary}</FigureHeader>
            ) : (
              config.columns.secondary
            ),
            cell: (row: Row) =>
              config.columns.numeric ? (
                <Figure>{row.secondary}</Figure>
              ) : (
                editable(row, preview(row.secondary))
              ),
          },
        ]
      : []),
  ];

  // Panel hẹp: tầng 1 là field/member/value, tầng 2 là phần còn lại, xám, một dòng
  const compactColumns: TableProps.ColumnDefinition<Row>[] = [
    {
      id: "element",
      header: config.columns.primary,
      isRowHeader: true,
      cell: (row) => (
        <div>
          {kind === "hash" ? row.primary : editable(row, preview(row.primary))}
          {row.secondary !== undefined && (
            <Box variant='small' display='block' color='text-body-secondary'>
              <span style={oneLineStyle}>
                {kind === "hash"
                  ? editable(row, preview(row.secondary))
                  : `${config.columns.secondary} ${row.secondary}`}
              </span>
            </Box>
          )}
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction({
      isFetching: query.isFetching && !query.isFetchingNextPage,
      refetch: () => query.refetch(),
    }),
    { id: "add", text: config.addText, primary: true, onClick: () => setModal({ id: "add" }) },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    ...(config.editable ? [{ id: "edit", text: "Edit", disabled: !single }] : []),
    { id: "delete", text: "Delete", disabled: !selected.length },
  ];
  const onMenuItemClick = (id: string) =>
    setModal(id === "edit" && single ? { id: "edit", row: single } : { id: "delete" });

  const deleteSelected = () =>
    updateKey.mutate(
      config.deleteUpdate(selected),
      notifyOutcome({
        success: `Deleted ${pluralize(selected.length, config.noun)}`,
        errorHeader: `Couldn't delete from ${name}`,
        then: () => {
          setSelected([]);
          closeModal();
        },
      }),
    );

  const footer = query.hasNextPage && (
    <Box textAlign='center'>
      <Button loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
        Load more
      </Button>
    </Box>
  );

  return (
    <div ref={ref}>
      <Table
        variant='embedded'
        selectionType='multi'
        trackBy='id'
        items={rows}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        empty={<EmptyState title={`No ${config.title.toLowerCase()}`} />}
        header={
          <Header
            counter={`(${value.length.toLocaleString()})`}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={onMenuItemClick}
              />
            }
          >
            {config.title}
          </Header>
        }
        footer={footer}
      />

      {modal?.id === "add" && (
        <ElementModal
          cluster={cluster}
          name={name}
          kind={kind}
          addText={config.addText}
          onDismiss={closeModal}
        />
      )}
      {modal?.id === "edit" && (
        <ElementModal
          cluster={cluster}
          name={name}
          kind={kind}
          addText={config.addText}
          target={modal.row}
          onDismiss={closeModal}
        />
      )}
      <ConfirmModal
        visible={modal?.id === "delete"}
        header={`Delete ${pluralize(selected.length, config.noun)}?`}
        actionText='Delete'
        loading={updateKey.isPending}
        onConfirm={deleteSelected}
        onDismiss={closeModal}
      >
        <Box>
          {selected.slice(0, DELETE_PREVIEW_COUNT).map((row) => (
            <div key={row.id}>{preview(row.primary)}</div>
          ))}
        </Box>
      </ConfirmModal>
    </div>
  );
}
