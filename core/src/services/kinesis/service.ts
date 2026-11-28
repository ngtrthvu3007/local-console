import type { KinesisClient } from "@aws-sdk/client-kinesis";
import type { LambdaService } from "#services/lambda/service.ts";
import { readRecords } from "./operations/records.ts";
import {
  createStream,
  deleteStreams,
  getStream,
  listShards,
  listStreams,
  putRecord,
  type StreamRow,
} from "./operations/streams.ts";
import type { DataViewerForm, NewStream } from "./schemas.ts";

export interface KinesisDeps {
  lambda: LambdaService;
}

export function createKinesisService(kinesis: KinesisClient, deps: KinesisDeps) {
  return {
    listStreams: () => listStreams(kinesis),
    getStream: (name: string) => getStream(kinesis, name),
    listShards: (name: string) => listShards(kinesis, name),
    createStream: (stream: NewStream) => createStream(kinesis, stream),
    putRecord: (stream: string, record: { partitionKey: string; data: string }) =>
      putRecord(kinesis, stream, record),
    deleteStreams: (names: readonly string[]) => deleteStreams(kinesis, names),
    readRecords: (stream: string, from: DataViewerForm | string) =>
      readRecords(kinesis, stream, from),
    // Floci giữ trigger của stream đã xóa (spec 7 #11): cảnh báo trước khi xóa
    listStreamsWithTriggers: async (streams: readonly Pick<StreamRow, "name" | "arn">[]) => {
      const checks = await Promise.all(
        streams.map(async (stream) =>
          (await deps.lambda.hasMappings(stream.arn)) ? [stream.name] : [],
        ),
      );
      return checks.flat();
    },
  };
}

export type KinesisService = ReturnType<typeof createKinesisService>;
