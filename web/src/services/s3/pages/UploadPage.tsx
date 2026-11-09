import { useRef, useState, type DragEvent, type RefObject } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import FileDropzone from "@cloudscape-design/components/file-dropzone";
import Header from "@cloudscape-design/components/header";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator, {
  type StatusIndicatorProps,
} from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { s3Uri } from "../helpers.ts";
import { useUploader } from "../hooks/useUploader.ts";
import { SEARCH_PARAMS, bucketCrumbs, s3Routes } from "../routes.ts";
import { filesFromDrop, filesFromInput, filesFromList } from "../uploadFiles.ts";
import { byteTotals, percentOf, type UploadItem, type UploadStatus } from "../uploadQueue.tsx";

const STATUS_DISPLAY: Record<UploadStatus, { type: StatusIndicatorProps.Type; text: string }> = {
  pending: { type: "pending", text: "Waiting" },
  uploading: { type: "in-progress", text: "Uploading" },
  done: { type: "success", text: "Uploaded" },
  error: { type: "error", text: "Failed" },
  canceled: { type: "stopped", text: "Canceled" },
};

function ProgressCell({ item }: { item: UploadItem }) {
  if (item.status === "uploading") {
    return <ProgressBar value={percentOf(item.uploadedBytes, item.file.size)} />;
  }
  const display = STATUS_DISPLAY[item.status];
  return <StatusIndicator type={display.type}>{item.error ?? display.text}</StatusIndicator>;
}

const COLUMNS: TableProps.ColumnDefinition<UploadItem>[] = [
  { id: "path", header: "Name", isRowHeader: true, cell: (item) => item.path },
  { id: "type", header: "Type", cell: (item) => item.file.type || NOT_AVAILABLE },
  { id: "size", header: "Size", cell: (item) => formatBytes(item.file.size) },
  { id: "status", header: "Status", cell: (item) => <ProgressCell item={item} /> },
];

interface HiddenInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  folder?: boolean;
  onPick: (files: FileList | null) => void;
}

// Input chọn file/folder ẩn, mở bằng nút của Cloudscape
function HiddenInput({ inputRef, folder, onPick }: HiddenInputProps) {
  const folderProps = folder ? { webkitdirectory: "" } : {};
  return (
    <input
      ref={inputRef}
      type='file'
      multiple
      hidden
      {...folderProps}
      onChange={(event) => {
        onPick(event.target.files);
        event.target.value = ""; // cho phép chọn lại cùng file
      }}
    />
  );
}

export function UploadPage() {
  const { bucket = "" } = useParams();
  const [searchParams] = useSearchParams();
  const prefix = searchParams.get(SEARCH_PARAMS.prefix) ?? "";
  const navigate = useNavigate();
  const uploader = useUploader(bucket, prefix);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useBreadcrumbs([
    ...bucketCrumbs(bucket, prefix),
    { text: "Upload", href: s3Routes.upload(bucket, prefix) },
  ]);

  const { items, running, started } = uploader;
  const { totalBytes, uploadedBytes } = byteTotals(items);
  const allUploaded = items.length > 0 && items.every((item) => item.status === "done");
  const backToBucket = () => navigate(s3Routes.bucket(bucket, { prefix }));

  // FileDropzone không trả nội dung folder kéo vào nên tự đọc ở đây
  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    uploader.add(await filesFromDrop(event.dataTransfer));
  };

  const removeSelected = () => {
    uploader.remove(selectedIds);
    setSelectedIds([]);
  };

  const dropzone = (
    <div onDropCapture={handleDrop}>
      <FileDropzone onChange={({ detail }) => uploader.add(filesFromList(detail.value))}>
        <SpaceBetween size='xs' alignItems='center'>
          <Box>Drag and drop files or folders here</Box>
          <SpaceBetween direction='horizontal' size='xs'>
            <Button
              iconName='add-plus'
              disabled={started}
              onClick={() => fileInput.current?.click()}
            >
              Add files
            </Button>
            <Button
              iconName='folder'
              disabled={started}
              onClick={() => folderInput.current?.click()}
            >
              Add folder
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </FileDropzone>
    </div>
  );

  const tableHeader = (
    <Header
      counter={`(${items.length} · ${formatBytes(totalBytes)})`}
      actions={
        <Button disabled={!selectedIds.length || started} onClick={removeSelected}>
          Remove
        </Button>
      }
    >
      Files and folders
    </Header>
  );

  const totalProgress = running && (
    <ProgressBar
      label='Total'
      value={percentOf(uploadedBytes, totalBytes)}
      additionalInfo={`${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)}`}
      description='You can leave this page. The upload keeps running in the background.'
    />
  );

  // Kết quả do hàng đợi báo (kể cả khi đã rời trang), ở đây chỉ cần quay về bucket
  const secondaryAction = running ? (
    <Button onClick={uploader.cancel}>Cancel upload</Button>
  ) : (
    <Button variant='link' onClick={backToBucket}>
      {started ? "Close" : "Cancel"}
    </Button>
  );

  const primaryAction = allUploaded ? (
    <Button variant='primary' onClick={backToBucket}>
      Done
    </Button>
  ) : (
    <Button
      variant='primary'
      disabled={!items.length || running}
      loading={running}
      onClick={uploader.start}
    >
      Upload
    </Button>
  );

  const header = (
    <Header variant='h1' description={`Destination: ${s3Uri(bucket, prefix)}`}>
      Upload
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <SpaceBetween size='l'>
        <Container>
          {dropzone}
          <HiddenInput
            inputRef={fileInput}
            onPick={(files) => uploader.add(filesFromInput(files))}
          />
          <HiddenInput
            inputRef={folderInput}
            folder
            onPick={(files) => uploader.add(filesFromInput(files))}
          />
        </Container>

        <Table
          variant='container'
          items={items}
          trackBy='id'
          selectionType='multi'
          selectedItems={items.filter((item) => selectedIds.includes(item.id))}
          onSelectionChange={({ detail }) =>
            setSelectedIds(detail.selectedItems.map((item) => item.id))
          }
          isItemDisabled={() => started}
          columnDefinitions={COLUMNS}
          empty={<EmptyState title='No files' description='Add files or folders to upload.' />}
          header={tableHeader}
          footer={totalProgress}
        />

        <Box float='right'>
          <SpaceBetween direction='horizontal' size='xs'>
            {secondaryAction}
            {primaryAction}
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
