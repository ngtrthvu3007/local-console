import { useState } from "react";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CONFIRM_PERMANENT_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDate } from "@shared/format.ts";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useObjectHistory, useRestoreVersion, type VersionEntry } from "../hooks/useObject.ts";
import { useDeleteObjects } from "../hooks/useObjects.ts";
import { useS3 } from "../hooks/useS3.ts";
import { downloadObject } from "../presign.ts";

// Version ID kèm nhãn "Latest" cho bản mới nhất; dùng ở cả bảng Objects
export function VersionIdLabel({
  versionId,
  isLatest,
}: {
  versionId?: string;
  isLatest?: boolean;
}) {
  return (
    <SpaceBetween direction='horizontal' size='xxs'>
      <span>{versionId}</span>
      {isLatest && <StatusIndicator type='info'>Latest</StatusIndicator>}
    </SpaceBetween>
  );
}

const COLUMNS: TableProps.ColumnDefinition<VersionEntry>[] = [
  {
    id: "version",
    header: "Version ID",
    isRowHeader: true,
    cell: (version) => <VersionIdLabel versionId={version.VersionId} isLatest={version.IsLatest} />,
  },
  {
    id: "type",
    header: "Type",
    cell: (version) => (version.isDeleteMarker ? "Delete marker" : "Version"),
  },
  {
    id: "modified",
    header: "Last modified",
    cell: (version) => formatDate(version.LastModified),
  },
  {
    id: "size",
    header: "Size",
    cell: (version) => (version.isDeleteMarker ? NOT_AVAILABLE : formatBytes(version.Size)),
  },
];

export function ObjectVersions({ bucket, objectKey }: { bucket: string; objectKey: string }) {
  const { signer } = useS3();
  const { ref, compact } = useIsCompact();
  const history = useObjectHistory(bucket, objectKey);
  const restore = useRestoreVersion(bucket);
  const deleteVersions = useDeleteObjects(bucket);
  const [selected, setSelected] = useState<VersionEntry | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const versionId = selected?.VersionId;
  const usableVersion = selected && !selected.isDeleteMarker ? selected : undefined;
  const refresh = () => history.refetch();

  const download = () =>
    usableVersion && downloadObject(signer, bucket, objectKey, usableVersion.VersionId);

  const restoreSelected = () =>
    usableVersion &&
    restore.mutate(
      { key: objectKey, versionId: usableVersion.VersionId! },
      notifyOutcome({
        success: `Restored version ${usableVersion.VersionId}`,
        errorHeader: "Couldn't restore",
        then: refresh,
      }),
    );

  const deleteSelected = () =>
    deleteVersions.mutate(
      [{ key: objectKey, name: objectKey, isFolder: false, versionId }],
      notifyBulkOutcome({
        success: () => `Deleted version ${versionId}`,
        errorHeader: "Couldn't delete the version",
        then: () => {
          setConfirmingDelete(false);
          setSelected(undefined);
          refresh();
        },
      }),
    );

  const actions: BarAction[] = [
    refreshAction(history),
    { id: "download", text: "Download", disabled: !usableVersion, onClick: download },
    {
      id: "restore",
      text: "Restore",
      disabled: !usableVersion || usableVersion.IsLatest,
      loading: restore.isPending,
      onClick: restoreSelected,
    },
    { id: "delete", text: "Delete", disabled: !selected, onClick: () => setConfirmingDelete(true) },
  ];

  const headerActions = <ActionBar compact={compact} actions={actions} />;

  const header = (
    <Header counter={`(${history.data?.length ?? 0})`} actions={headerActions}>
      Versions
    </Header>
  );

  const empty = emptyOrError(history, <EmptyState title='No versions' />);

  return (
    <div ref={ref}>
      <Table
        variant='container'
        items={history.data ?? []}
        trackBy='VersionId'
        selectionType='single'
        selectedItems={selected ? [selected] : []}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems[0])}
        loading={history.isLoading}
        loadingText='Loading versions'
        columnDefinitions={COLUMNS}
        empty={empty}
        header={header}
      />
      <ConfirmModal
        visible={confirmingDelete}
        header='Permanently delete this version?'
        confirmText={CONFIRM_PERMANENT_DELETE}
        actionText='Delete'
        loading={deleteVersions.isPending}
        onDismiss={() => setConfirmingDelete(false)}
        onConfirm={deleteSelected}
      >
        Version {versionId} of {objectKey} is deleted for good.
      </ConfirmModal>
    </div>
  );
}
