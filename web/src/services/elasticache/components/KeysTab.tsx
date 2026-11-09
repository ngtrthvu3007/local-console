import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { REDIS_ERROR_CODES, type KeySummary } from "@server/routes/redis/contract.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DELETE_PREVIEW_COUNT, DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { errorMessage, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { ALL_KEYS_PATTERN, ALL_TYPES_OPTION, KEY_TYPE_OPTIONS } from "../constants.ts";
import { isTransitional, type Cluster } from "../hooks/useClusters.ts";
import {
  errorCode,
  isKeyNotFound,
  mergeKeyPages,
  useDeleteKeys,
  useFlushDatabase,
  useKeyPages,
  useKeyValue,
  type KeyFilter,
} from "../hooks/useRedis.ts";
import { keySummary, ttlCell, typeLabel } from "../keyText.ts";
import { SEARCH_PARAMS } from "../routes.ts";
import { CreateKeyModal } from "./CreateKeyModal.tsx";
import { KeyValueBody } from "./KeyValueBody.tsx";
import { TtlModal } from "./TtlModal.tsx";

const DEFAULT_FILTER: KeyFilter = { pattern: ALL_KEYS_PATTERN };
const TYPE_FILTER_OPTIONS = [ALL_TYPES_OPTION, ...KEY_TYPE_OPTIONS];
const ENTER_KEY = "Enter";

// Key thường chung tiền tố (user:1:…), phần phân biệt ở cuối: xuống dòng ở bất kỳ ký tự nào, không cắt
const keyNameStyle = { overflowWrap: "anywhere" } as const;
// Hàng lọc: một hàng trên khung rộng; khung hẹp thì Pattern một hàng, Type + Run hàng dưới
const WIDE_FILTER_GRID = [{ colspan: 7 }, { colspan: 3 }, { colspan: 2 }];
const COMPACT_FILTER_GRID = [{ colspan: 12 }, { colspan: 8 }, { colspan: 4 }];

type ModalId = "create" | "delete" | "flush" | "ttl" | "deleteOpenKey";

interface Props {
  cluster: Cluster;
  keyCount?: number; // số key của DB (để ghi trong modal Flush)
}

export function KeysTab({ cluster, keyCount }: Props) {
  const clusterId = cluster.id;
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openKey = searchParams.get(SEARCH_PARAMS.key) ?? undefined;
  const [draft, setDraft] = useState<KeyFilter>(DEFAULT_FILTER);
  const [filter, setFilter] = useState<KeyFilter>(DEFAULT_FILTER);
  const [runId, setRunId] = useState(0);
  const [selected, setSelected] = useState<KeySummary[]>([]);
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);

  const ready = !isTransitional(cluster);
  const pages = useKeyPages(clusterId, filter, runId, ready);
  const keys = pages.data?.pages.flatMap((page) => page.keys) ?? [];
  const keyValue = useKeyValue(clusterId, openKey);
  const value = keyValue.data ? mergeKeyPages(keyValue.data.pages) : undefined;
  const deleteKeys = useDeleteKeys(clusterId);
  const flush = useFlushDatabase(clusterId);

  // Key đang mở đã bị xóa hoặc hết hạn: danh sách cũng tải lại cho khớp
  const openKeyGone = isKeyNotFound(keyValue.error);
  const refetchKeys = pages.refetch;
  useEffect(() => {
    if (openKeyGone) refetchKeys();
  }, [openKeyGone, refetchKeys]);

  // ---------- Panel: key đang mở lưu trên URL ----------

  const keyHref = (name: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.key, name);
    return `?${next}`;
  };
  // Mở từ trạng thái đóng thì thêm vào lịch sử; đổi key khi đang mở thì thay.
  // Nhờ vậy nút Back luôn đóng panel và giữ vị trí cuộn của danh sách.
  const selectKey = (name: string) => navigate(keyHref(name), { replace: Boolean(openKey) });
  const closeKey = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SEARCH_PARAMS.key);
        return next;
      },
      { replace: true },
    );

  // Nút nằm dưới mô tả, không cùng hàng với tiêu đề: panel bên phải có thể chỉ rộng
  // khoảng 240px (khi sidebar mở), để chung hàng thì tên bị bóp vỡ từng chữ
  const panelActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button disabled={!value} onClick={() => setModal("ttl")}>
        Set TTL
      </Button>
      <Button disabled={!value} onClick={() => setModal("deleteOpenKey")}>
        Delete
      </Button>
    </SpaceBetween>
  );

  useSplitPanel(
    openKey
      ? {
          header: openKey,
          description: value && keySummary(value),
          onClose: closeKey,
          body: (
            <SpaceBetween size='m'>
              {panelActions}
              <KeyValueBody cluster={clusterId} name={openKey} query={keyValue} value={value} />
            </SpaceBetween>
          ),
        }
      : null,
  );

  // ---------- Lọc ----------

  const run = (next: KeyFilter) => {
    setDraft(next);
    setFilter(next);
    setRunId((current) => current + 1);
    setSelected([]);
  };
  const reset = () => run(DEFAULT_FILTER);
  const filtered = filter.pattern !== ALL_KEYS_PATTERN || filter.type !== undefined;

  const filterRow = (
    <Grid gridDefinition={compact ? COMPACT_FILTER_GRID : WIDE_FILTER_GRID}>
      <Input
        type='search'
        ariaLabel='Pattern'
        placeholder='Pattern, for example user:*'
        value={draft.pattern}
        onChange={({ detail }) => setDraft({ ...draft, pattern: detail.value })}
        onKeyDown={({ detail }) => detail.key === ENTER_KEY && run(draft)}
      />
      <Select
        ariaLabel='Type'
        options={TYPE_FILTER_OPTIONS}
        selectedOption={
          TYPE_FILTER_OPTIONS.find((option) => option.value === (draft.type ?? "")) ?? null
        }
        onChange={({ detail }) =>
          setDraft({
            ...draft,
            // "All types" không có trong KEY_TYPE_OPTIONS nên thành undefined
            type: KEY_TYPE_OPTIONS.find((option) => option.value === detail.selectedOption.value)
              ?.value,
          })
        }
      />
      <Button
        fullWidth
        loading={pages.isFetching && !pages.isFetchingNextPage}
        onClick={() => run({ ...draft, pattern: draft.pattern.trim() || ALL_KEYS_PATTERN })}
      >
        Run
      </Button>
    </Grid>
  );

  // ---------- Cột ----------

  const keyLink = (key: KeySummary) => (
    <Link
      href={keyHref(key.name)}
      onFollow={(event) => {
        event.preventDefault();
        selectKey(key.name);
      }}
    >
      {/* Key đang mở in đậm: Table của Cloudscape không có kiểu dòng "đang mở" riêng */}
      <span style={keyNameStyle} aria-current={key.name === openKey || undefined}>
        {key.name === openKey ? <strong>{key.name}</strong> : key.name}
      </span>
    </Link>
  );

  const wideColumns: TableProps.ColumnDefinition<KeySummary>[] = [
    { id: "key", header: "Key", isRowHeader: true, cell: keyLink },
    {
      id: "type",
      header: "Type",
      cell: (key) => <Box color='text-body-secondary'>{typeLabel(key.type)}</Box>,
    },
    {
      id: "ttl",
      header: <FigureHeader>TTL</FigureHeader>,
      cell: (key) => <Figure>{ttlCell(key.ttl)}</Figure>,
    },
  ];
  // Khung hẹp: tầng 1 là key, tầng 2 là kiểu · TTL, xám
  const compactColumns: TableProps.ColumnDefinition<KeySummary>[] = [
    {
      id: "key",
      header: "Key",
      isRowHeader: true,
      cell: (key) => (
        <div>
          {keyLink(key)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[typeLabel(key.type), ttlCell(key.ttl)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  // ---------- Thao tác ----------

  const barActions: BarAction[] = [
    refreshAction(pages),
    {
      id: "create",
      text: "Create key",
      primary: true,
      disabled: !ready,
      onClick: () => setModal("create"),
    },
  ];
  // Flush chỉ nằm trong dropdown: thao tác phá hủy không bao giờ là nút chính
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: "delete", text: "Delete", disabled: !selected.length },
    { id: "flush", text: "Flush database", disabled: !ready },
  ];

  const header = (
    <Header
      counter={
        pages.data ? `(${keys.length.toLocaleString()}${pages.hasNextPage ? "+" : ""})` : undefined
      }
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={menuItems}
          onMenuItemClick={(id) => setModal(id === "flush" ? "flush" : "delete")}
        />
      }
    >
      Keys
    </Header>
  );

  // ---------- Trạng thái rỗng ----------

  const loadMoreButton = (
    <Button loading={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>
      Load more
    </Button>
  );
  const unsupported = errorCode(pages.error) === REDIS_ERROR_CODES.unsupportedCluster;
  const emptyContent = !ready ? (
    <Box textAlign='center' padding={{ vertical: "s" }}>
      <StatusIndicator type='in-progress'>Cluster is {cluster.status}</StatusIndicator>
    </Box>
  ) : unsupported ? (
    <EmptyState title="Keys aren't available" description={errorMessage(pages.error)} />
  ) : pages.hasNextPage ? (
    // Pattern hiếm khớp: trang này không có key nào nhưng DB còn chỗ chưa quét
    <EmptyState title='No keys matched in this page.' action={loadMoreButton} />
  ) : filtered ? (
    <EmptyState
      title={`No keys match ${filter.pattern}`}
      action={<Button onClick={reset}>Reset</Button>}
    />
  ) : (
    <EmptyState
      title='This database is empty.'
      action={<Button onClick={() => setModal("create")}>Create key</Button>}
    />
  );
  const footer = pages.hasNextPage && keys.length > 0 && (
    <Box textAlign='center'>{loadMoreButton}</Box>
  );

  // ---------- Modal ----------

  const deleteNames =
    modal === "deleteOpenKey" && openKey ? [openKey] : selected.map((key) => key.name);
  const confirmDelete = () =>
    deleteKeys.mutate(
      deleteNames,
      notifyOutcome({
        success: `Deleted ${pluralize(deleteNames.length, "key")}`,
        errorHeader: "Couldn't delete",
        then: () => {
          if (openKey && deleteNames.includes(openKey)) closeKey();
          setSelected([]);
          closeModal();
        },
      }),
    );
  const confirmFlush = () =>
    flush.mutate(
      undefined,
      notifyOutcome({
        success: `Flushed ${clusterId}`,
        errorHeader: `Couldn't flush ${clusterId}`,
        then: () => {
          closeKey();
          setSelected([]);
          closeModal();
        },
      }),
    );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        selectionType='multi'
        trackBy='name'
        items={keys}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={ready && pages.isLoading}
        loadingText='Loading keys'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines
        stickyHeader
        empty={unsupported || !ready ? emptyContent : emptyOrError(pages, emptyContent)}
        header={header}
        filter={filterRow}
        footer={footer}
      />

      {modal === "create" && (
        <CreateKeyModal
          cluster={clusterId}
          onDismiss={closeModal}
          onCreated={(name) => {
            closeModal();
            selectKey(name);
          }}
        />
      )}
      {modal === "ttl" && openKey && value && (
        <TtlModal cluster={clusterId} name={openKey} ttl={value.ttl} onDismiss={closeModal} />
      )}
      <ConfirmModal
        visible={modal === "delete" || modal === "deleteOpenKey"}
        header={`Delete ${pluralize(deleteNames.length, "key")}?`}
        confirmText={CONFIRM_DELETE}
        actionText='Delete'
        loading={deleteKeys.isPending}
        onConfirm={confirmDelete}
        onDismiss={closeModal}
      >
        <Box>
          {deleteNames.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
            <div key={name} style={keyNameStyle}>
              {name}
            </div>
          ))}
        </Box>
      </ConfirmModal>
      <ConfirmModal
        visible={modal === "flush"}
        header={`Flush ${clusterId}?`}
        confirmText={clusterId}
        actionText='Flush'
        loading={flush.isPending}
        onConfirm={confirmFlush}
        onDismiss={closeModal}
      >
        <Box>
          {keyCount === undefined
            ? "Every key in database 0 is deleted."
            : `Every key in database 0 is deleted (${pluralize(keyCount, "key")}).`}{" "}
          This can't be undone.
        </Box>
      </ConfirmModal>
    </div>
  );
}
