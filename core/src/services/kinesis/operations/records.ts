import {
  GetRecordsCommand,
  GetShardIteratorCommand,
  type KinesisClient,
  type _Record as KinesisRecord,
} from "@aws-sdk/client-kinesis";
import { RECORDS_PAGE_SIZE } from "#services/kinesis/constants.ts";
import { gunzipIfGzip } from "#services/kinesis/recordData.ts";
import type { DataViewerForm } from "#services/kinesis/schemas.ts";

export type { KinesisRecord };

async function shardIterator(kinesis: KinesisClient, stream: string, view: DataViewerForm) {
  const { ShardIterator } = await kinesis.send(
    new GetShardIteratorCommand({
      StreamName: stream,
      ShardId: view.shardId,
      ShardIteratorType: view.position,
      Timestamp: view.position === "AT_TIMESTAMP" ? new Date(view.timestamp) : undefined,
    }),
  );
  return ShardIterator ?? "";
}

// from: vị trí đã chọn (đọc mới) hoặc NextShardIterator của trang trước. Iterator hết hạn sau 5 phút
export async function readRecords(
  kinesis: KinesisClient,
  stream: string,
  from: DataViewerForm | string,
) {
  const fresh = typeof from !== "string";
  const iterator = fresh ? await shardIterator(kinesis, stream, from) : from;
  const { Records = [], NextShardIterator } = await kinesis.send(
    new GetRecordsCommand({ ShardIterator: iterator, Limit: RECORDS_PAGE_SIZE }),
  );
  // Record gzip (subscription filter của CloudWatch Logs) giải nén trước khi trả
  const records = await Promise.all(
    Records.map(async (record) =>
      record.Data ? { ...record, Data: await gunzipIfGzip(record.Data) } : record,
    ),
  );
  return { fresh, records, nextIterator: NextShardIterator };
}
