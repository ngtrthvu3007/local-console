import { useState, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  DETAIL_SEPARATOR,
  ITEM_LIST_WIDTH_PX,
  ITEMS_PAGE_SIZE,
  RESULT_SEPARATOR,
} from "../constants.ts";
import { cellText, isNestedValue, itemId, type Item } from "../itemJson.ts";
import { useExportTable, useItemPages, type SearchRequest } from "../hooks/useItems.ts";
import { keyAttributesOf, keySchemaOf, type IndexKeys } from "../hooks/useTables.ts";
import { resultSummary, searchSummary } from "../searchSummary.ts";
import type { ItemSearchForm } from "../schemas.ts";
import { DeleteItemsModal } from "./DeleteItemsModal.tsx";
import { Figure, FigureHeader } from "./Figure.tsx";
import { ImportModal } from "./ImportModal.tsx";
import { ItemEditorModal, type ItemEditorMode } from "./ItemEditorModal.tsx";
import { EMPTY_SEARCH, SearchForm, toItemSearch } from "./SearchForm.tsx";

const MODALS = {
  edit: "edit",
  duplicate: "duplicate",
  create: "create",
  delete: "delete",
  import: "import",
} as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];
// Trên điện thoại tầng 2 của mỗi dòng chỉ hiện vài attribute đầu; muốn xem đủ thì mở item
const COMPACT_PREVIEW_ATTRIBUTES = 3;

const keyNamesOf = (keys: IndexKeys) => keyAttributesOf(keys).map((key) => key.name);

// Key của bảng đứng đầu, rồi mọi attribute khác theo thứ tự xuất hiện trong các item đang hiện
function columnNames(items: Item[], keys: IndexKeys) {
  const names = new Set(keyNamesOf(keys));
  for (const item of items) for (const name of Object.keys(item)) names.add(name);
  return [...names];
}

const isNumberColumn = (items: Item[], name: string) => {
  const present = items.filter((item) => item[name]);
  return present.length > 0 && present.every((item) => item[name].N !== undefined);
};

// Giá trị thiếu là "—" xám; Map/List/Set xám để key và giá trị chính nổi lên
function ValueCell({ item, name }: { item: Item; name: string }) {
  const value = item[name];
  const quiet = !value || isNestedValue(value);
  return <Box color={quiet ? "text-body-secondary" : "inherit"}>{cellText(value)}</Box>;
}

interface Props {
  table: TableDescription;
}

export function ItemsTab({ table }: Props) {
  const tableName = table.TableName!;
  const tableKeys = keySchemaOf(table);
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const [searchForm, setSearchForm] = useState<ItemSearchForm>(EMPTY_SEARCH);
  const [runId, setRunId] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Item[]>([]);
  const [modal, setModal] = useState<{ id: ModalId; item?: Item } | null>(null);

  const search = toItemSearch(searchForm);
  const searchKeys = keySchemaOf(table, search.indexName);
  const request: SearchRequest = { search, keys: searchKeys, runId };
  const pages = useItemPages(tableName, request);
  const exportTable = useExportTable(tableName);
  const loadedPages = pages.data?.pages ?? [];
  const items = loadedPages.flatMap((page) => page.items);
  const summary = searchSummary(tableName, search, searchKeys);
  // Có kết quả thì nối thêm số item: "Scan on orders — 50 returned"
  const summaryLine = pages.data
    ? [summary, resultSummary(loadedPages)].join(RESULT_SEPARATOR)
    : summary;
  const hasConditions = search.mode === "query" || search.filters.length > 0;
  const closeModal = () => setModal(null);
  const single = selected.length === 1 ? selected[0] : undefined;

  const run = (form: ItemSearchForm) => {
    setSearchForm(form);
    setRunId((current) => current + 1);
    setSelected([]);
    setSearchOpen(false);
  };
  const reset = () => run(EMPTY_SEARCH);

  const exportAll = () =>
    exportTable.mutate(
      undefined,
      notifyOutcome({
        success: (count: number) => `Exported ${count.toLocaleString()} items from ${tableName}`,
        errorHeader: "Couldn't export",
      }),
    );

  const openItem = (item: Item) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    setModal({ id: MODALS.edit, item });
  };

  // ---------- Cột ----------

  const names = columnNames(items, tableKeys);
  const [partitionKeyName] = names;
  const keyLink = (item: Item, children: ReactNode) => (
    <Link href='#' onFollow={openItem(item)}>
      {children}
    </Link>
  );

  const wideColumns: TableProps.ColumnDefinition<Item>[] = names.map((name) => {
    const numeric = isNumberColumn(items, name);
    return {
      id: name,
      header: numeric ? <FigureHeader>{name}</FigureHeader> : name,
      isRowHeader: name === partitionKeyName,
      cell: (item) => {
        if (name === partitionKeyName) return keyLink(item, cellText(item[name]));
        return numeric && item[name] ? (
          <Figure>{cellText(item[name])}</Figure>
        ) : (
          <ValueCell item={item} name={name} />
        );
      },
    };
  });

  // Điện thoại: tầng 1 là key (mở item), tầng 2 là vài attribute đầu, xám
  const otherNames = names.filter((name) => !keyNamesOf(tableKeys).includes(name));
  const compactColumns: TableProps.ColumnDefinition<Item>[] = [
    {
      id: "item",
      header: keyNamesOf(tableKeys).join(DETAIL_SEPARATOR),
      isRowHeader: true,
      cell: (item) => (
        <div>
          {keyLink(
            item,
            keyNamesOf(tableKeys)
              .map((name) => cellText(item[name]))
              .join(DETAIL_SEPARATOR),
          )}
          <Box variant='small' display='block' color='text-body-secondary'>
            {otherNames
              .filter((name) => item[name])
              .slice(0, COMPACT_PREVIEW_ATTRIBUTES)
              .map((name) => `${name} ${cellText(item[name])}`)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  // ---------- Thao tác ----------

  const barActions: BarAction[] = [
    refreshAction(pages),
    { id: MODALS.import, text: "Import", onClick: () => setModal({ id: MODALS.import }) },
    { id: "export", text: "Export", loading: exportTable.isPending, onClick: exportAll },
    // Create item đứng cuối như nút chính, nhưng kiểu thường vì nút chính của tab là Run ở form tìm
    {
      id: MODALS.create,
      text: "Create item",
      primary: true,
      quiet: true,
      onClick: () => setModal({ id: MODALS.create }),
    },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MODALS.edit, text: "Edit", disabled: !single },
    { id: MODALS.duplicate, text: "Duplicate", disabled: !single },
    { id: MODALS.delete, text: "Delete", disabled: !selected.length },
  ];
  const onMenuItemClick = (id: string) => setModal({ id: id as ModalId, item: single });

  const counter = pages.data
    ? `(${items.length.toLocaleString()}${pages.hasNextPage ? "+" : ""})`
    : undefined;
  const header = (
    <Header
      counter={counter}
      // Trên điện thoại câu tóm tắt đã nằm ở khối tìm thu gọn, không lặp lại
      description={compact ? undefined : summaryLine}
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={menuItems}
          onMenuItemClick={onMenuItemClick}
        />
      }
    >
      Items
    </Header>
  );

  // ---------- Trạng thái rỗng ----------

  const loadMoreButton = (
    <Button loading={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>
      Load {ITEMS_PAGE_SIZE} more
    </Button>
  );
  const emptyContent = pages.hasNextPage ? (
    // Filter lọc sau khi đọc: trang này không khớp nhưng bảng còn item chưa đọc
    <EmptyState
      title={`No items matched in the first ${loadedPages.reduce((total, page) => total + page.scannedCount, 0).toLocaleString()} scanned.`}
      description='Load more to keep looking.'
      action={loadMoreButton}
    />
  ) : hasConditions ? (
    <EmptyState
      title='No items match these conditions.'
      action={<Button onClick={reset}>Reset</Button>}
    />
  ) : (
    <EmptyState
      title='This table is empty.'
      action={
        <SpaceBetween direction='horizontal' size='xs'>
          <Button onClick={() => setModal({ id: MODALS.create })}>Create item</Button>
          <Button onClick={() => setModal({ id: MODALS.import })}>Import</Button>
        </SpaceBetween>
      }
    />
  );

  const footer = pages.hasNextPage && items.length > 0 && (
    <Box textAlign='center'>{loadMoreButton}</Box>
  );

  // ---------- Form tìm: luôn mở trên desktop, thu gọn thành câu tóm tắt trên điện thoại ----------

  const searchPanel = (
    <SearchForm
      key={runId}
      table={table}
      initial={searchForm}
      running={pages.isFetching && !pages.isFetchingNextPage}
      onRun={run}
      onReset={reset}
    />
  );
  // Một hàng: câu tóm tắt + kết quả, nút Edit search bên phải (xuống dòng nếu câu dài)
  const collapsedSearch = (
    <Container>
      <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
        <Box>{summaryLine}</Box>
        <Button onClick={() => setSearchOpen(true)}>Edit search</Button>
      </SpaceBetween>
    </Container>
  );

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        {compact && !searchOpen ? collapsedSearch : searchPanel}
        <Table
          variant='container'
          selectionType='multi'
          trackBy={(item) => itemId(item, tableKeys)}
          items={items}
          selectedItems={selected}
          onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
          loading={pages.isLoading}
          loadingText='Loading items'
          columnDefinitions={compact ? compactColumns : wideColumns}
          stickyColumns={compact ? undefined : { first: 1 }}
          stickyHeader
          wrapLines={compact}
          empty={emptyOrError(pages, emptyContent)}
          header={header}
          footer={footer}
        />
      </SpaceBetween>

      {(modal?.id === MODALS.create ||
        modal?.id === MODALS.edit ||
        modal?.id === MODALS.duplicate) && (
        <ItemEditorModal
          table={table}
          mode={modal.id as ItemEditorMode}
          item={modal.item}
          onDismiss={closeModal}
        />
      )}
      {modal?.id === MODALS.delete && (
        <DeleteItemsModal
          table={table}
          items={selected}
          onDismiss={closeModal}
          onDone={() => {
            closeModal();
            setSelected([]);
          }}
        />
      )}
      {modal?.id === MODALS.import && <ImportModal table={table} onDismiss={closeModal} />}
    </div>
  );
}
