import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { isNotFoundError } from "@shared/aws.ts";
import { copyToClipboard } from "@shared/clipboard.ts";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { NotFound } from "@shared/components/NotFound.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { TagsTable } from "@shared/components/TagsTable.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  DeleteObjectsModal,
  EditMetadataModal,
  ObjectTagsModal,
} from "../components/ObjectModals.tsx";
import { ObjectPreview } from "../components/ObjectPreview.tsx";
import { ObjectVersions } from "../components/ObjectVersions.tsx";
import { PresignModal } from "../components/PresignModal.tsx";
import { PATH_DELIMITER } from "../constants.ts";
import { fileNameOf, objectUrl, s3Uri } from "../helpers.ts";
import { useIsVersioned } from "../hooks/useBucketSettings.ts";
import { useHeadObject, useObjectTags } from "../hooks/useObject.ts";
import { useS3 } from "../hooks/useS3.ts";
import { downloadObject } from "../presign.ts";
import { SEARCH_PARAMS, bucketCrumbs, s3Routes } from "../routes.ts";

const MODALS = {
  delete: "delete",
  metadata: "metadata",
  tags: "tags",
  presign: "presign",
} as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

const OVERVIEW_COLUMNS = 3;
const USER_METADATA_PREFIX = "x-amz-meta-";

interface MetadataEntry {
  name: string;
  value: string;
}

const METADATA_COLUMNS: TableProps.ColumnDefinition<MetadataEntry>[] = [
  {
    id: "name",
    header: "Key",
    isRowHeader: true,
    cell: (entry) => USER_METADATA_PREFIX + entry.name,
  },
  { id: "value", header: "Value", cell: (entry) => entry.value },
];

const parentPrefix = (key: string) => key.slice(0, key.lastIndexOf(PATH_DELIMITER) + 1);

export function ObjectDetail() {
  const { bucket = "" } = useParams();
  const [searchParams] = useSearchParams();
  const key = searchParams.get(SEARCH_PARAMS.key) ?? "";
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const { signer } = useS3();
  const { flociPublicUrl } = useLoadedConfig();
  const head = useHeadObject(bucket, key);
  const tags = useObjectTags(bucket, key, head.isSuccess);
  const versioned = useIsVersioned(bucket);
  const [openModal, setOpenModal] = useState<ModalId | null>(null);
  const folder = parentPrefix(key);
  const fileName = fileNameOf(key);
  const closeModal = () => setOpenModal(null);

  useBreadcrumbs([
    ...bucketCrumbs(bucket, folder),
    { text: fileName, href: s3Routes.object(bucket, key) },
  ]);

  if (head.isLoading) return <Spinner size='large' />;
  if (head.isError && isNotFoundError(head.error)) {
    return (
      <NotFound
        title={`Object ${fileName} not found`}
        description={`${s3Uri(bucket, key)} doesn't exist, or its latest version is a delete marker.`}
        backHref={s3Routes.bucket(bucket, { prefix: folder })}
        backText='Back to folder'
      />
    );
  }

  const object = head.data;
  const uri = s3Uri(bucket, key);
  const url = objectUrl(flociPublicUrl, bucket, key);
  const metadata = Object.entries(object?.Metadata ?? {}).map(([name, value]) => ({ name, value }));

  const download = () => downloadObject(signer, bucket, key);

  const overviewItems: KeyValuePairsProps.Item[] = [
    { label: "Key", value: key },
    { label: "Size", value: formatBytes(object?.ContentLength) },
    { label: "Type", value: object?.ContentType ?? NOT_AVAILABLE },
    { label: "Last modified", value: formatDate(object?.LastModified) },
    { label: "ETag", value: object?.ETag ?? NOT_AVAILABLE },
    { label: "Version ID", value: object?.VersionId ?? NOT_AVAILABLE },
    { label: "S3 URI", value: <CopyButton variant='inline' text={uri} label={uri} /> },
    { label: "Object URL", value: <CopyButton variant='inline' text={url} label={url} /> },
  ];

  const metadataHeader = (
    <Header
      counter={`(${metadata.length})`}
      actions={<Button onClick={() => setOpenModal(MODALS.metadata)}>Edit</Button>}
    >
      Metadata
    </Header>
  );

  const propertiesTab = (
    <SpaceBetween size='l'>
      <Container header={<Header variant='h2'>Object overview</Header>}>
        <KeyValuePairs columns={OVERVIEW_COLUMNS} items={overviewItems} />
      </Container>
      <Table
        variant='container'
        items={metadata}
        trackBy='name'
        columnDefinitions={METADATA_COLUMNS}
        empty={<EmptyState title='No user-defined metadata' />}
        header={metadataHeader}
      />
    </SpaceBetween>
  );

  const previewTab = (
    <ObjectPreview
      bucket={bucket}
      objectKey={key}
      contentType={object?.ContentType}
      size={object?.ContentLength}
    />
  );

  const tagsTab = (
    <TagsTable
      tags={tags.data ?? []}
      loading={tags.isLoading}
      onEdit={() => setOpenModal(MODALS.tags)}
    />
  );

  const versionsTab: TabsProps.Tab = {
    id: "versions",
    label: "Versions",
    content: <ObjectVersions bucket={bucket} objectKey={key} />,
  };

  const tabs: TabsProps.Tab[] = [
    { id: "properties", label: "Properties", content: propertiesTab },
    { id: "preview", label: "Preview", content: previewTab },
    ...(versioned ? [versionsTab] : []),
    { id: "tags", label: "Tags", content: tagsTab },
  ];

  const actions: BarAction[] = [
    {
      id: "copy-uri",
      text: "Copy S3 URI",
      iconName: "copy",
      onClick: () => copyToClipboard(uri, "S3 URI"),
    },
    {
      id: MODALS.presign,
      text: "Share with a pre-signed URL",
      onClick: () => setOpenModal(MODALS.presign),
    },
    { id: MODALS.delete, text: "Delete", onClick: () => setOpenModal(MODALS.delete) },
    { id: "download", text: "Download", iconName: "download", primary: true, onClick: download },
  ];

  const headerActions = <ActionBar compact={compact} actions={actions} />;

  const header = (
    <Header variant='h1' description={uri} actions={headerActions}>
      {fileName}
    </Header>
  );

  return (
    <ContentLayout header={<div ref={ref}>{header}</div>}>
      <Tabs tabs={tabs} />

      {openModal === MODALS.metadata && (
        <EditMetadataModal bucket={bucket} objectKey={key} onDismiss={closeModal} />
      )}
      {openModal === MODALS.tags && (
        <ObjectTagsModal bucket={bucket} objectKey={key} onDismiss={closeModal} />
      )}
      {openModal === MODALS.presign && (
        <PresignModal bucket={bucket} objectKey={key} onDismiss={closeModal} />
      )}
      {openModal === MODALS.delete && (
        <DeleteObjectsModal
          bucket={bucket}
          rows={[{ key, name: fileName, isFolder: false }]}
          versioned={versioned}
          onDismiss={closeModal}
          onDone={() => navigate(s3Routes.bucket(bucket, { prefix: folder }))}
        />
      )}
    </ContentLayout>
  );
}
