import { useEffect, useState } from "react";
import {
  cancelBatch,
  releaseBatch,
  runBatch,
  startBatch,
  toUploadItems,
  useUploadBatches,
  type UploadItem,
} from "../uploadQueue.tsx";
import type { PickedFile } from "../uploadFiles.ts";
import { useInvalidateObjects } from "./useObjects.ts";
import { useS3 } from "./useS3.ts";

// Trước khi bấm Upload: danh sách nháp của trang. Sau đó: một lượt trong hàng đợi chung,
// vẫn chạy tiếp khi rời trang.
export function useUploader(bucket: string, prefix: string) {
  const { s3 } = useS3();
  const invalidateObjects = useInvalidateObjects();
  const [draft, setDraft] = useState<UploadItem[]>([]);
  const [batchId, setBatchId] = useState<number>();
  const batch = useUploadBatches().find((candidate) => candidate.id === batchId);

  useEffect(
    () => () => {
      if (batchId !== undefined) releaseBatch(batchId);
    },
    [batchId],
  );

  const onFinished = () => invalidateObjects(bucket);

  // Đã bấm Upload thì danh sách cố định; muốn thêm file thì mở lượt upload mới
  const add = (files: PickedFile[]) => {
    if (batch) return;
    setDraft((list) => {
      const knownPaths = new Set(list.map((item) => item.path));
      return [...list, ...toUploadItems(files.filter((picked) => !knownPaths.has(picked.path)))];
    });
  };

  const remove = (ids: number[]) =>
    setDraft((list) => list.filter((item) => !ids.includes(item.id)));

  // Lần đầu tạo lượt mới; các lần sau chạy lại những file lỗi/bị hủy của lượt đó
  const start = () => {
    if (batch) return void runBatch(s3, batch.id, onFinished);
    setBatchId(startBatch(s3, { bucket, prefix, items: draft }, onFinished));
  };

  const cancel = () => {
    if (batchId !== undefined) cancelBatch(batchId);
  };

  return {
    items: batch?.items ?? draft,
    started: Boolean(batch),
    running: batch?.running ?? false,
    add,
    remove,
    start,
    cancel,
  };
}
