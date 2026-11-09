import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import type { Bucket } from "@aws-sdk/client-s3";
import { copyToClipboard } from "@shared/clipboard.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeleteBucketModal, EmptyBucketModal } from "../components/BucketModals.tsx";
import { BUCKET_LIST_PAGE_SIZE } from "../constants.ts";
import { useBuckets } from "../hooks/useBuckets.ts";
import { s3BaseCrumbs, s3Routes } from "../routes.ts";

const BUCKET_NAME_FIELD = "Name";
const CREATION_DATE_FIELD = "CreationDate";

export function BucketList() {
  useBreadcrumbs(s3BaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const buckets = useBuckets();
  const [openModal, setOpenModal] = useState<"delete" | "empty" | null>(null);

  const createButton = (
    <Button variant='primary' href={s3Routes.createBucket} onFollow={follow}>
      Create bucket
    </Button>
  );

  const emptyState = emptyOrError(
    buckets,
    <EmptyState
      title='No buckets'
      description={`You don't have any buckets in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Bucket>(buckets.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: BUCKET_NAME_FIELD } } },
      pagination: { pageSize: BUCKET_LIST_PAGE_SIZE },
      selection: { trackBy: BUCKET_NAME_FIELD },
    });

  const selectedBucket = collectionProps.selectedItems?.[0]?.Name;
  const closeModal = () => setOpenModal(null);
  const finishDelete = () => {
    closeModal();
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<Bucket> = {
    id: "name",
    header: "Name",
    sortingField: BUCKET_NAME_FIELD,
    isRowHeader: true,
    cell: (bucket) => (
      <Link href={s3Routes.bucket(bucket.Name!)} onFollow={follow}>
        {bucket.Name}
      </Link>
    ),
  };
  const createdColumn: TableProps.ColumnDefinition<Bucket> = {
    id: "created",
    header: "Creation date",
    sortingField: CREATION_DATE_FIELD,
    cell: (bucket) => formatDate(bucket.CreationDate),
  };
  // Khung hẹp chỉ giữ tên bucket
  const columns = compact ? [nameColumn] : [nameColumn, createdColumn];

  const barActions: BarAction[] = [
    refreshAction(buckets),
    {
      id: "copy-name",
      text: "Copy name",
      iconName: "copy",
      disabled: !selectedBucket,
      onClick: () => selectedBucket && copyToClipboard(selectedBucket, "bucket name"),
    },
    { id: "empty", text: "Empty", disabled: !selectedBucket, onClick: () => setOpenModal("empty") },
    {
      id: "delete",
      text: "Delete",
      disabled: !selectedBucket,
      onClick: () => setOpenModal("delete"),
    },
    { id: "create", text: "Create bucket", primary: true, href: s3Routes.createBucket },
  ];

  const headerActions = <ActionBar compact={compact} actions={barActions} />;

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={buckets.data ? `(${buckets.data.length})` : undefined}
      description={`Buckets are containers for data stored in S3. Region: ${region}.`}
      actions={headerActions}
    >
      Buckets
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find buckets by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        trackBy={BUCKET_NAME_FIELD}
        items={items}
        loading={buckets.isLoading}
        loadingText='Loading buckets'
        columnDefinitions={columns}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {selectedBucket && (
        <>
          <DeleteBucketModal
            bucket={selectedBucket}
            visible={openModal === "delete"}
            onDismiss={closeModal}
            onDone={finishDelete}
          />
          <EmptyBucketModal
            bucket={selectedBucket}
            visible={openModal === "empty"}
            onDismiss={closeModal}
          />
        </>
      )}
    </div>
  );
}
