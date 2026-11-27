import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import type { MultipartUpload } from "@aws-sdk/client-s3";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatDate, pluralize } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useAbortMultipartUploads, useMultipartUploads } from "../../hooks/useBucketSettings.ts";

const COLUMNS: TableProps.ColumnDefinition<MultipartUpload>[] = [
  { id: "key", header: "Key", isRowHeader: true, cell: (upload) => upload.Key },
  { id: "uploadId", header: "Upload ID", cell: (upload) => upload.UploadId },
  { id: "initiated", header: "Initiated", cell: (upload) => formatDate(upload.Initiated) },
];

const DESCRIPTION =
  "Uploads that were started but never completed. Their parts still use storage until aborted.";

export function MultipartUploadsSection({ bucket }: { bucket: string }) {
  const uploads = useMultipartUploads(bucket);
  const abortUploads = useAbortMultipartUploads(bucket);
  const [selected, setSelected] = useState<MultipartUpload[]>([]);
  const [confirming, setConfirming] = useState(false);
  const items = uploads.data ?? [];

  const abort = () =>
    abortUploads.mutate(
      selected.map((upload) => ({ key: upload.Key!, uploadId: upload.UploadId! })),
      notifyOutcome({
        success: `Aborted ${pluralize(selected.length, "upload")}`,
        errorHeader: "Couldn't abort uploads",
        then: () => {
          setConfirming(false);
          setSelected([]);
        },
      }),
    );

  const headerActions = (
    <ResponsiveActions toolbar>
      <Button
        iconName='refresh'
        ariaLabel='Refresh'
        loading={uploads.isFetching}
        onClick={() => uploads.refetch()}
      />
      <Button disabled={!selected.length} onClick={() => setConfirming(true)}>
        Abort
      </Button>
    </ResponsiveActions>
  );

  const header = (
    <Header counter={`(${items.length})`} description={DESCRIPTION} actions={headerActions}>
      Incomplete multipart uploads
    </Header>
  );

  const empty = emptyOrError(uploads, <EmptyState title='No incomplete uploads' />);

  return (
    <>
      <Table
        variant='container'
        items={items}
        trackBy='UploadId'
        selectionType='multi'
        ariaLabels={selectionLabels<MultipartUpload>(
          "upload",
          (item) => `${item.Key ?? ""} ${item.UploadId ?? ""}`,
        )}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={uploads.isLoading}
        loadingText='Loading multipart uploads'
        columnDefinitions={COLUMNS}
        empty={empty}
        header={header}
      />
      <ConfirmModal
        visible={confirming}
        header={`Abort ${pluralize(selected.length, "upload")}?`}
        actionText='Abort'
        loading={abortUploads.isPending}
        onDismiss={() => setConfirming(false)}
        onConfirm={abort}
      >
        Uploaded parts are deleted. The objects will not be created.
      </ConfirmModal>
    </>
  );
}
