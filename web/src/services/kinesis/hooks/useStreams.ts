import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewStream, StreamRow } from "@localconsole/core/kinesis";
import { useKinesisService } from "./useKinesisService.ts";

export type { StreamRow };

const KINESIS_QUERY_ROOT = "kinesis";
const streamsQueryKey = [KINESIS_QUERY_ROOT, "streams"];
const WITH_TRIGGERS = "with-triggers";
const streamQueryKey = (name: string, part?: string) =>
  part ? [KINESIS_QUERY_ROOT, "stream", name, part] : [KINESIS_QUERY_ROOT, "stream", name];

export function useStreams() {
  const kinesis = useKinesisService();

  return useQuery({ queryKey: streamsQueryKey, queryFn: kinesis.listStreams });
}

export function useStream(name: string) {
  const kinesis = useKinesisService();

  return useQuery({
    queryKey: streamQueryKey(name),
    queryFn: () => kinesis.getStream(name),
    retry: false,
  });
}

export function useShards(name: string) {
  const kinesis = useKinesisService();

  return useQuery({
    queryKey: streamQueryKey(name, "shards"),
    queryFn: () => kinesis.listShards(name),
  });
}

export function useCreateStream() {
  const kinesis = useKinesisService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stream: NewStream) => kinesis.createStream(stream),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KINESIS_QUERY_ROOT] }),
  });
}

// Data viewer không tự tải lại sau khi gửi: người dùng bấm Get records
export function usePutRecord(stream: string) {
  const kinesis = useKinesisService();

  return useMutation({
    mutationFn: (record: { partitionKey: string; data: string }) =>
      kinesis.putRecord(stream, record),
  });
}

export function useStreamsWithTriggers(streams: readonly Pick<StreamRow, "name" | "arn">[]) {
  const kinesis = useKinesisService();

  return useQuery({
    queryKey: [KINESIS_QUERY_ROOT, WITH_TRIGGERS, streams.map((stream) => stream.arn).join()],
    queryFn: () => kinesis.listStreamsWithTriggers(streams),
  });
}

export function useDeleteStreams() {
  const kinesis = useKinesisService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) => kinesis.deleteStreams(names),
    // Không tải lại chi tiết: stream vừa xóa thành "not found", gỡ modal trước khi kịp về danh sách
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: streamsQueryKey }),
        queryClient.invalidateQueries({ queryKey: [KINESIS_QUERY_ROOT, WITH_TRIGGERS] }),
      ]),
  });
}
