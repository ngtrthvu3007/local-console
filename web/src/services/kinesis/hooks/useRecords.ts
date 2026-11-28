import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { DataViewerForm, KinesisRecord } from "@localconsole/core/kinesis";
import { notifyError } from "@shared/hooks/useNotify.ts";
import { useKinesisService } from "./useKinesisService.ts";

export type { KinesisRecord };

interface RecordsPage {
  records: KinesisRecord[];
  nextIterator?: string;
  atEnd: boolean;
}

// Như Data viewer của AWS: Get records từ vị trí đã chọn, Next records đọc tiếp; không tự tải lại
export function useRecords(stream: string) {
  const kinesis = useKinesisService();
  const [page, setPage] = useState<RecordsPage>();

  const read = useMutation({
    mutationFn: (from: DataViewerForm | string) => kinesis.readRecords(stream, from),
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
