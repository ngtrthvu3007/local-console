import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  ListShardsCommand,
  PutRecordCommand,
  paginateListStreams,
  type KinesisClient,
  type Shard,
} from "@aws-sdk/client-kinesis";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { allPages, collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import type { NewStream } from "#services/kinesis/schemas.ts";

export interface StreamRow {
  name: string;
  arn: string;
  status?: string;
  mode?: string;
  openShards?: number;
  createdAt?: Date;
}

// ListStreams không có số shard: DescribeStreamSummary từng stream (local ít stream nên gọi song song)
export async function listStreams(kinesis: KinesisClient): Promise<StreamRow[]> {
  const summaries = await collectPages(
    paginateListStreams({ client: kinesis }, {}),
    (page) => page.StreamSummaries,
  );

  return Promise.all(
    summaries.map(async (summary) => {
      const { StreamDescriptionSummary } = await kinesis.send(
        new DescribeStreamSummaryCommand({ StreamName: summary.StreamName }),
      );
      return {
        name: summary.StreamName ?? "",
        arn: summary.StreamARN ?? "",
        status: summary.StreamStatus,
        mode: summary.StreamModeDetails?.StreamMode,
        openShards: StreamDescriptionSummary?.OpenShardCount,
        createdAt: summary.StreamCreationTimestamp,
      };
    }),
  );
}

// null = không có. Floci trả ResourceNotFoundException với mã 400 (spec 7 #9)
export const getStream = (kinesis: KinesisClient, name: string) =>
  orEmptyWhenNotFound(
    async () =>
      (await kinesis.send(new DescribeStreamSummaryCommand({ StreamName: name })))
        .StreamDescriptionSummary ?? null,
    null,
  );

// Trang sau của ListShards chỉ nhận NextToken, gửi kèm StreamName thì AWS báo lỗi
export const listShards = (kinesis: KinesisClient, name: string) =>
  allPages<Shard>(async (nextToken) => {
    const page = await kinesis.send(
      new ListShardsCommand(nextToken ? { NextToken: nextToken } : { StreamName: name }),
    );
    return { items: page.Shards ?? [], nextToken: page.NextToken };
  });

export async function createStream(kinesis: KinesisClient, stream: NewStream) {
  await kinesis.send(
    new CreateStreamCommand({
      StreamName: stream.name,
      StreamModeDetails: { StreamMode: stream.mode },
      // On-demand tự chia shard, gửi ShardCount thì AWS từ chối
      ShardCount: stream.mode === "PROVISIONED" ? stream.shards : undefined,
    }),
  );
  return stream.name;
}

export const putRecord = (
  kinesis: KinesisClient,
  stream: string,
  { partitionKey, data }: { partitionKey: string; data: string },
) =>
  kinesis.send(
    new PutRecordCommand({
      StreamName: stream,
      PartitionKey: partitionKey,
      Data: new TextEncoder().encode(data),
    }),
  );

export const deleteStreams = (kinesis: KinesisClient, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    // Stream còn consumer (enhanced fan-out) thì AWS từ chối xóa nếu không bật cờ này
    (name) =>
      kinesis.send(new DeleteStreamCommand({ StreamName: name, EnforceConsumerDeletion: true })),
  );
