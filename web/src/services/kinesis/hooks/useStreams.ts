import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  ListShardsCommand,
  PutRecordCommand,
  paginateListStreams,
  type KinesisClient,
  type Shard,
  type StreamSummary,
} from "@aws-sdk/client-kinesis";
import { ListEventSourceMappingsCommand } from "@aws-sdk/client-lambda";
import { allPages, orEmptyWhenNotFound } from "@shared/aws.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import type { NewStream } from "../schemas.ts";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { useKinesis } from "./useKinesis.ts";

// Mọi query của Kinesis nằm dưới key gốc này
const KINESIS_QUERY_ROOT = "kinesis";
const streamsQueryKey = [KINESIS_QUERY_ROOT, "streams"];
const streamQueryKey = (name: string, part?: string) =>
  part ? [KINESIS_QUERY_ROOT, "stream", name, part] : [KINESIS_QUERY_ROOT, "stream", name];

export interface StreamRow {
  name: string;
  arn: string;
  status?: string;
  mode?: string;
  openShards?: number;
  createdAt?: Date;
}

async function listStreamSummaries(client: KinesisClient) {
  const summaries: StreamSummary[] = [];

  for await (const page of paginateListStreams({ client }, {})) {
    summaries.push(...(page.StreamSummaries ?? []));
  }

  return summaries;
}

// ListStreams không có số shard: hỏi DescribeStreamSummary từng stream (local ít stream nên gọi song song)
async function listStreamRows(client: KinesisClient): Promise<StreamRow[]> {
  const summaries = await listStreamSummaries(client);

  return Promise.all(
    summaries.map(async (summary) => {
      const { StreamDescriptionSummary } = await client.send(
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

export function useStreams() {
  const client = useKinesis();

  return useQuery({ queryKey: streamsQueryKey, queryFn: () => listStreamRows(client) });
}

// null = stream không có. Floci trả ResourceNotFoundException với mã 400 (spec 7 #9)
export function useStream(name: string) {
  const client = useKinesis();

  return useQuery({
    queryKey: streamQueryKey(name),
    queryFn: () =>
      orEmptyWhenNotFound(
        async () =>
          (await client.send(new DescribeStreamSummaryCommand({ StreamName: name })))
            .StreamDescriptionSummary ?? null,
        null,
      ),
    retry: false,
  });
}

// Trang sau của ListShards chỉ nhận NextToken, gửi kèm StreamName thì AWS báo lỗi
export function useShards(name: string) {
  const client = useKinesis();

  return useQuery({
    queryKey: streamQueryKey(name, "shards"),
    queryFn: () =>
      allPages<Shard>(async (nextToken) => {
        const page = await client.send(
          new ListShardsCommand(nextToken ? { NextToken: nextToken } : { StreamName: name }),
        );
        return { items: page.Shards ?? [], nextToken: page.NextToken };
      }),
  });
}

export function useCreateStream() {
  const client = useKinesis();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stream: NewStream) => {
      await client.send(
        new CreateStreamCommand({
          StreamName: stream.name,
          StreamModeDetails: { StreamMode: stream.mode },
          // On-demand tự chia shard, gửi ShardCount sẽ bị AWS từ chối
          ShardCount: stream.mode === "PROVISIONED" ? stream.shards : undefined,
        }),
      );
      return stream.name;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KINESIS_QUERY_ROOT] }),
  });
}

// Data gửi dạng byte UTF-8; Data viewer không tự tải lại, người dùng bấm Get records
export function usePutRecord(stream: string) {
  const client = useKinesis();

  return useMutation({
    mutationFn: (record: { partitionKey: string; data: string }) =>
      client.send(
        new PutRecordCommand({
          StreamName: stream,
          PartitionKey: record.partitionKey,
          Data: new TextEncoder().encode(record.data),
        }),
      ),
  });
}

// Cảnh báo khi xóa: Floci giữ trigger của stream đã xóa (spec 7 #11). Chỉ cần biết có hay không,
// nên mỗi stream chỉ đọc trang đầu
export function useStreamsWithTriggers(streams: readonly Pick<StreamRow, "name" | "arn">[]) {
  const { lambda } = useLambda();

  return useQuery({
    queryKey: [KINESIS_QUERY_ROOT, "with-triggers", streams.map((stream) => stream.arn).join()],
    queryFn: async () => {
      const checks = await Promise.all(
        streams.map(async (stream) => {
          const { EventSourceMappings = [] } = await lambda.send(
            new ListEventSourceMappingsCommand({ EventSourceArn: stream.arn }),
          );
          return EventSourceMappings.length ? [stream.name] : [];
        }),
      );
      return checks.flat();
    },
  });
}

export function useDeleteStreams() {
  const client = useKinesis();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (names: readonly string[]) => {
      const failures: string[] = [];

      for (const name of names) {
        try {
          // Stream còn consumer (enhanced fan-out) thì AWS từ chối xóa nếu không bật cờ này
          await client.send(
            new DeleteStreamCommand({ StreamName: name, EnforceConsumerDeletion: true }),
          );
        } catch (error) {
          failures.push(`${name}: ${errorMessage(error)}`);
        }
      }

      return { count: names.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KINESIS_QUERY_ROOT] }),
  });
}
