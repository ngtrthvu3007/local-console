import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  GetRecordsCommand,
  GetShardIteratorCommand,
  type KinesisClient,
  type _Record as KinesisRecord,
} from "@aws-sdk/client-kinesis";
import { notifyError } from "@shared/hooks/useNotify.ts";
import { RECORDS_PAGE_SIZE } from "../constants.ts";
import type { DataViewerForm } from "../schemas.ts";
import { useKinesis } from "./useKinesis.ts";

export type { KinesisRecord };

interface RecordsPage {
  records: KinesisRecord[];
  nextIterator?: string;
  atEnd: boolean;
}

async function shardIterator(client: KinesisClient, stream: string, view: DataViewerForm) {
  const { ShardIterator } = await client.send(
    new GetShardIteratorCommand({
      StreamName: stream,
      ShardId: view.shardId,
      ShardIteratorType: view.position,
      Timestamp: view.position === "AT_TIMESTAMP" ? new Date(view.timestamp) : undefined,
    }),
  );
  return ShardIterator ?? "";
}

// Đọc theo trang như Data viewer của AWS: Get records từ vị trí đã chọn, Next records đọc tiếp.
// Không tự tải lại: iterator hết hạn sau 5 phút, bấm Get records lại
export function useRecords(stream: string) {
  const client = useKinesis();
  const [page, setPage] = useState<RecordsPage>();

  const read = useMutation({
    mutationFn: async (from: DataViewerForm | string) => {
      const fresh = typeof from !== "string";
      const iterator = fresh ? await shardIterator(client, stream, from) : from;
      const { Records = [], NextShardIterator } = await client.send(
        new GetRecordsCommand({ ShardIterator: iterator, Limit: RECORDS_PAGE_SIZE }),
      );
      return { fresh, records: Records, nextIterator: NextShardIterator };
    },
    onSuccess: ({ fresh, records, nextIterator }) =>
      setPage((previous) =>
        // Next records hết record: giữ trang đang xem, chỉ khóa nút. Lần đọc mới rỗng (vd Latest)
        // vẫn cho Next records để thấy record gửi tới sau
        !fresh && !records.length && previous
          ? { ...previous, atEnd: true }
          : { records, nextIterator, atEnd: !nextIterator },
      ),
  });

  const onError = (error: unknown) => notifyError(error, "Couldn't get records");

  return {
    page,
    loading: read.isPending,
    load: (view: DataViewerForm) => read.mutate(view, { onError }),
    next: () => {
      if (page?.nextIterator) read.mutate(page.nextIterator, { onError });
    },
  };
}
