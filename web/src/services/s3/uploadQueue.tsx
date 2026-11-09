import type { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import Button from "@cloudscape-design/components/button";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import { formatBytes, pluralize } from "@shared/format.ts";
import { notifyBulkResult, setLiveMessage } from "@shared/hooks/useNotify.ts";
import { createStore } from "@shared/store.ts";
import {
  MIN_MULTIPART_PART_BYTES,
  UPLOAD_FILES_IN_PARALLEL,
  UPLOAD_PARTS_IN_PARALLEL,
} from "./constants.ts";
import { s3Uri } from "./helpers.ts";
import type { PickedFile } from "./uploadFiles.ts";

// Hàng đợi upload nằm ngoài React: rời trang Upload thì upload vẫn chạy,
// tiến trình hiện trên thanh thông báo ở mọi trang.

export type UploadStatus = "pending" | "uploading" | "done" | "error" | "canceled";

export interface UploadItem extends PickedFile {
  id: number;
  uploadedBytes: number;
  status: UploadStatus;
  error?: string;
}

export interface UploadBatch {
  id: number;
  bucket: string;
  prefix: string;
  items: UploadItem[];
  running: boolean;
  detached: boolean; // trang Upload đã đóng: xong thì bỏ khỏi bộ nhớ (giữ File rất tốn RAM)
}

const FAILED_STATUSES: UploadStatus[] = ["error", "canceled"];
const RETRYABLE_STATUSES: UploadStatus[] = ["pending", ...FAILED_STATUSES];
const ABORT_ERROR_NAME = "AbortError";
const CANCELED_REASON = "Canceled";
const PERCENT = 100;

const store = createStore<UploadBatch[]>([]);
export const useUploadBatches = store.use;

// Upload đang chạy và cờ hủy của mỗi lượt; không cần render nên để ngoài store
interface BatchControl {
  canceled: boolean;
  uploads: Set<Upload>;
}
const controls = new Map<number, BatchControl>();

let nextId = 0;

export const toUploadItems = (files: PickedFile[]): UploadItem[] =>
  files.map((picked) => ({ ...picked, id: nextId++, uploadedBytes: 0, status: "pending" }));

export const percentOf = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * PERCENT) : PERCENT;

export const byteTotals = (items: UploadItem[]) => ({
  totalBytes: items.reduce((sum, item) => sum + item.file.size, 0),
  uploadedBytes: items.reduce((sum, item) => sum + item.uploadedBytes, 0),
});

const batchOf = (batchId: number) => store.get().find((batch) => batch.id === batchId);
const messageId = (batchId: number) => `upload-${batchId}`;

function progressMessage(batch: UploadBatch) {
  const { totalBytes, uploadedBytes } = byteTotals(batch.items);
  return {
    type: "in-progress" as const,
    loading: true,
    header: `Uploading ${pluralize(batch.items.length, "file")} to ${s3Uri(batch.bucket, batch.prefix)}`,
    content: (
      <ProgressBar
        variant='flash'
        value={percentOf(uploadedBytes, totalBytes)}
        additionalInfo={`${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)}`}
      />
    ),
    action: <Button onClick={() => cancelBatch(batch.id)}>Cancel</Button>,
  };
}

function updateBatch(batchId: number, change: (batch: UploadBatch) => Partial<UploadBatch>) {
  store.set(
    store.get().map((batch) => (batch.id === batchId ? { ...batch, ...change(batch) } : batch)),
  );
  const batch = batchOf(batchId);
  if (batch?.running) setLiveMessage(messageId(batchId), progressMessage(batch));
}

const updateItem = (batchId: number, itemId: number, change: Partial<UploadItem>) =>
  updateBatch(batchId, (batch) => ({
    items: batch.items.map((item) => (item.id === itemId ? { ...item, ...change } : item)),
  }));

const removeBatch = (batchId: number) =>
  store.set(store.get().filter((batch) => batch.id !== batchId));

async function uploadItem(
  s3: S3Client,
  batch: UploadBatch,
  item: UploadItem,
  control: BatchControl,
) {
  if (control.canceled) return updateItem(batch.id, item.id, { status: "canceled" });
  updateItem(batch.id, item.id, { status: "uploading", uploadedBytes: 0, error: undefined });
  // lib-storage tự chia file lớn thành nhiều phần (multipart upload)
  const upload = new Upload({
    client: s3,
    queueSize: UPLOAD_PARTS_IN_PARALLEL,
    partSize: MIN_MULTIPART_PART_BYTES,
    leavePartsOnError: false,
    params: {
      Bucket: batch.bucket,
      Key: batch.prefix + item.path,
      Body: item.file,
      ContentType: item.file.type || undefined,
    },
  });
  control.uploads.add(upload);
  upload.on("httpUploadProgress", (progress) =>
    updateItem(batch.id, item.id, { uploadedBytes: progress.loaded ?? 0 }),
  );
  try {
    await upload.done();
    updateItem(batch.id, item.id, { status: "done", uploadedBytes: item.file.size });
  } catch (error) {
    const { name, message } = error as Error;
    const aborted = control.canceled || name === ABORT_ERROR_NAME;
    updateItem(
      batch.id,
      item.id,
      aborted ? { status: "canceled" } : { status: "error", error: message },
    );
  } finally {
    control.uploads.delete(upload);
  }
}

function reportResult(batch: UploadBatch) {
  const uploaded = batch.items.filter((item) => item.status === "done");
  const failures = batch.items
    .filter((item) => FAILED_STATUSES.includes(item.status))
    .map((item) => `${item.path}: ${item.error ?? CANCELED_REASON}`);
  const uploadedBytes = uploaded.reduce((sum, item) => sum + item.file.size, 0);
  notifyBulkResult(
    `Uploaded ${pluralize(uploaded.length, "file")} (${formatBytes(uploadedBytes)}) to ${s3Uri(batch.bucket, batch.prefix)}`,
    failures,
  );
}

// Chạy (hoặc chạy lại) các file chưa xong của một lượt
export async function runBatch(s3: S3Client, batchId: number, onFinished: () => void) {
  const batch = batchOf(batchId);
  if (!batch || batch.running) return;
  const control: BatchControl = { canceled: false, uploads: new Set() };
  controls.set(batchId, control);
  updateBatch(batchId, () => ({ running: true }));

  const queue = batch.items.filter((item) => RETRYABLE_STATUSES.includes(item.status));
  const workers = Array.from({ length: UPLOAD_FILES_IN_PARALLEL }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      await uploadItem(s3, batch, item, control);
    }
  });
  await Promise.all(workers);

  controls.delete(batchId);
  updateBatch(batchId, () => ({ running: false }));
  setLiveMessage(messageId(batchId), null);
  const finished = batchOf(batchId);
  if (finished) reportResult(finished);
  if (finished?.detached) removeBatch(batchId);
  onFinished();
}

export function startBatch(
  s3: S3Client,
  target: { bucket: string; prefix: string; items: UploadItem[] },
  onFinished: () => void,
) {
  const batchId = nextId++;
  store.set([...store.get(), { ...target, id: batchId, running: false, detached: false }]);
  void runBatch(s3, batchId, onFinished);
  return batchId;
}

export function cancelBatch(batchId: number) {
  const control = controls.get(batchId);
  if (!control) return;
  control.canceled = true;
  control.uploads.forEach((upload) => upload.abort());
}

// Trang Upload đóng: lượt đã xong thì bỏ ngay, đang chạy thì bỏ khi xong
export function releaseBatch(batchId: number) {
  const batch = batchOf(batchId);
  if (!batch) return;
  if (batch.running) updateBatch(batchId, () => ({ detached: true }));
  else removeBatch(batchId);
}

// Đóng tab hoặc tải lại trang khi đang upload thì trình duyệt hỏi lại
window.addEventListener("beforeunload", (event) => {
  if (store.get().some((batch) => batch.running)) event.preventDefault();
});
