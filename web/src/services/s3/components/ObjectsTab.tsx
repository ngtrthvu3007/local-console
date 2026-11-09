import { useEffect, useState, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import Icon from "@cloudscape-design/components/icon";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import { copyToClipboard } from "@shared/clipboard.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDate } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DOWNLOAD_SPACING_MS } from "../constants.ts";
import { extensionOf, s3Uri } from "../helpers.ts";
import { useIsVersioned } from "../hooks/useBucketSettings.ts";
import { useObjectVersions, useObjects, type ObjectRow } from "../hooks/useObjects.ts";
import { useS3 } from "../hooks/useS3.ts";
import { downloadObject } from "../presign.ts";
import { s3Routes } from "../routes.ts";
import {
  CreateFolderModal,
  DeleteObjectsModal,
  EditMetadataModal,
  ObjectTagsModal,
  RenameModal,
  TransferModal,
} from "./ObjectModals.tsx";
import { VersionIdLabel } from "./ObjectVersions.tsx";
import { PresignModal } from "./PresignModal.tsx";

const MODALS = {
  createFolder: "create-folder",
  delete: "delete",
  copy: "copy",
  move: "move",
  rename: "rename",
  metadata: "metadata",
  tags: "tags",
  presign: "presign",
} as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

const waitBetweenDownloads = () =>
  new Promise((resolve) => setTimeout(resolve, DOWNLOAD_SPACING_MS));

const rowId = (row: ObjectRow) => row.key + (row.versionId ?? "");

function rowType(row: ObjectRow) {
  if (row.isFolder) return "Folder";
  if (row.isDeleteMarker) return "Delete marker";
  return extensionOf(row.name);
}

// Icon nằm ngoài link (không bị gạch chân) và màu nhạt để không lấn tên
function NameWithIcon({ row, children }: { row: ObjectRow; children: ReactNode }) {
  return (
    <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
      <Icon
        name={row.isFolder ? "folder" : "file"}
        variant={row.isDeleteMarker ? "disabled" : "subtle"}
      />
      {children}
    </SpaceBetween>
  );
}

const typeColumn: TableProps.ColumnDefinition<ObjectRow> = {
  id: "type",
  header: "Type",
  cell: rowType,
};
const versionColumn: TableProps.ColumnDefinition<ObjectRow> = {
  id: "version",
  header: "Version ID",
  cell: (row) =>
    row.isFolder ? (
      NOT_AVAILABLE
    ) : (
      <VersionIdLabel versionId={row.versionId} isLatest={row.isLatest} />
    ),
};
const modifiedColumn: TableProps.ColumnDefinition<ObjectRow> = {
  id: "modified",
  header: "Last modified",
  cell: (row) => (row.isFolder ? NOT_AVAILABLE : formatDate(row.lastModified)),
};
const sizeColumn: TableProps.ColumnDefinition<ObjectRow> = {
  id: "size",
  header: "Size",
  cell: (row) => (row.isFolder || row.isDeleteMarker ? NOT_AVAILABLE : formatBytes(row.size)),
};

interface Props {
  bucket: string;
  prefix: string;
  onOpenFolder: (prefix: string) => void;
}

export function ObjectsTab({ bucket, prefix, onOpenFolder }: Props) {
  const follow = useFollow();
  const { signer } = useS3();
  const { ref, compact } = useIsCompact();
  const versioned = useIsVersioned(bucket);
  const [search, setSearch] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [selected, setSelected] = useState<ObjectRow[]>([]);
  const [openModal, setOpenModal] = useState<ModalId | null>(null);

  useEffect(() => {
    setSelected([]);
    setSearch("");
  }, [prefix, showVersions]);

  const versionsMode = versioned && showVersions;
  const objectsQuery = useObjects(bucket, prefix, search, !versionsMode);
  const versionsQuery = useObjectVersions(bucket, prefix, search, versionsMode);
  const query = versionsMode ? versionsQuery : objectsQuery;
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];

  const single = selected.length === 1 ? selected[0] : undefined;
  const singleFile = single && !single.isFolder && !single.isDeleteMarker ? single : undefined;
  const selectedFiles = selected.filter((row) => !row.isFolder && !row.isDeleteMarker);
  const uploadHref = s3Routes.upload(bucket, prefix);
  const closeModal = () => setOpenModal(null);
  // Thao tác trên các mục đang chọn xong thì đóng modal và bỏ chọn
  const finishBulk = () => {
    closeModal();
    setSelected([]);
  };

  const downloadSelected = async () => {
    for (const row of selectedFiles) {
      await downloadObject(signer, bucket, row.key, row.versionId);
      await waitBetweenDownloads();
    }
  };

  const openFolder = (row: ObjectRow) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    onOpenFolder(row.key);
  };

  const nameColumn: TableProps.ColumnDefinition<ObjectRow> = {
    id: "name",
    header: "Name",
    isRowHeader: true,
    cell: (row) => {
      const name = row.isDeleteMarker ? (
        <Box color='text-body-secondary'>{row.name}</Box>
      ) : row.isFolder ? (
        <Link href={s3Routes.bucket(bucket, { prefix: row.key })} onFollow={openFolder(row)}>
          {row.name}
        </Link>
      ) : (
        <Link href={s3Routes.object(bucket, row.key)} onFollow={follow}>
          {row.name}
        </Link>
      );
      return <NameWithIcon row={row}>{name}</NameWithIcon>;
    },
  };

  // Khung hẹp chỉ giữ cột tên và cột chính (size / version), bỏ cột phụ để không cuộn ngang
  const wideColumns = versionsMode
    ? [nameColumn, typeColumn, versionColumn, modifiedColumn, sizeColumn]
    : [nameColumn, typeColumn, modifiedColumn, sizeColumn];
  const compactColumns = versionsMode ? [nameColumn, versionColumn] : [nameColumn, sizeColumn];

  const actions: BarAction[] = [
    refreshAction(query),
    {
      id: "copy-uri",
      text: "Copy S3 URI",
      iconName: "copy",
      disabled: !single,
      onClick: () => single && copyToClipboard(s3Uri(bucket, single.key), "S3 URI"),
    },
    {
      id: "download",
      text: "Download",
      iconName: "download",
      disabled: !selectedFiles.length,
      onClick: downloadSelected,
    },
    {
      id: MODALS.createFolder,
      text: "Create folder",
      iconName: "folder",
      disabled: versionsMode,
      onClick: () => setOpenModal(MODALS.createFolder),
    },
    { id: "upload", text: "Upload", iconName: "add-plus", primary: true, href: uploadHref },
  ];

  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MODALS.copy, text: "Copy", disabled: !selected.length || versionsMode },
    { id: MODALS.move, text: "Move", disabled: !selected.length || versionsMode },
    { id: MODALS.rename, text: "Rename", disabled: !single || versionsMode },
    { id: MODALS.metadata, text: "Edit metadata", disabled: !singleFile || versionsMode },
    { id: MODALS.tags, text: "Edit tags", disabled: !singleFile || versionsMode },
    {
      id: MODALS.presign,
      text: "Share with a pre-signed URL",
      disabled: !singleFile || versionsMode,
    },
    { id: MODALS.delete, text: "Delete", disabled: !selected.length },
  ];

  const headerActions = (
    <ActionBar
      compact={compact}
      actions={actions}
      menuItems={menuItems}
      onMenuItemClick={(id) => setOpenModal(id as ModalId)}
    />
  );

  const counter = query.data ? `(${rows.length}${query.hasNextPage ? "+" : ""})` : undefined;
  const header = (
    <Header counter={counter} actions={headerActions}>
      Objects
    </Header>
  );

  const filter = (
    <SpaceBetween direction='horizontal' size='l' alignItems='center'>
      <TextFilter
        filteringText={search}
        filteringPlaceholder='Find objects by prefix'
        onChange={({ detail }) => setSearch(detail.filteringText)}
      />
      {versioned && (
        <Toggle checked={showVersions} onChange={({ detail }) => setShowVersions(detail.checked)}>
          Show versions
        </Toggle>
      )}
    </SpaceBetween>
  );

  const emptyDescription = prefix
    ? "This folder is empty."
    : "This bucket is empty. Upload files to get started.";
  const uploadButton = (
    <Button href={uploadHref} onFollow={follow}>
      Upload
    </Button>
  );
  const empty = emptyOrError(
    query,
    search ? (
      <EmptyState title='No matches' description={`No objects start with "${prefix}${search}".`} />
    ) : (
      <EmptyState title='No objects' description={emptyDescription} action={uploadButton} />
    ),
  );

  const footer = query.hasNextPage && (
    <Box textAlign='center'>
      <Button
        variant='inline-link'
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      >
        Load more
      </Button>
    </Box>
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        selectionType='multi'
        trackBy={rowId}
        items={rows}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        isItemDisabled={(row) => versionsMode && row.isFolder}
        loading={query.isLoading}
        loadingText='Loading objects'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        empty={empty}
        header={header}
        filter={filter}
        footer={footer}
      />

      {openModal === MODALS.createFolder && (
        <CreateFolderModal bucket={bucket} prefix={prefix} onDismiss={closeModal} />
      )}
      {openModal === MODALS.delete && (
        <DeleteObjectsModal
          bucket={bucket}
          rows={selected}
          versioned={versioned}
          onDismiss={closeModal}
          onDone={finishBulk}
        />
      )}
      {(openModal === MODALS.copy || openModal === MODALS.move) && (
        <TransferModal
          bucket={bucket}
          prefix={prefix}
          rows={selected}
          move={openModal === MODALS.move}
          onDismiss={closeModal}
          onDone={finishBulk}
        />
      )}
      {openModal === MODALS.rename && single && (
        <RenameModal
          bucket={bucket}
          prefix={prefix}
          row={single}
          onDismiss={closeModal}
          onDone={finishBulk}
        />
      )}
      {openModal === MODALS.metadata && singleFile && (
        <EditMetadataModal bucket={bucket} objectKey={singleFile.key} onDismiss={closeModal} />
      )}
      {openModal === MODALS.tags && singleFile && (
        <ObjectTagsModal bucket={bucket} objectKey={singleFile.key} onDismiss={closeModal} />
      )}
      {openModal === MODALS.presign && singleFile && (
        <PresignModal bucket={bucket} objectKey={singleFile.key} onDismiss={closeModal} />
      )}
    </div>
  );
}
