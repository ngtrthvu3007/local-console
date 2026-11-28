import {
  DescribeTimeToLiveCommand,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
  type DynamoDBClient,
  type StreamSpecification,
} from "@aws-sdk/client-dynamodb";
import type { StreamViewTypeId } from "#services/dynamodb/constants.ts";

export interface TimeToLiveChange {
  enabled: boolean;
  attributeName: string;
}

export interface StreamChange {
  enabled: boolean;
  viewType: StreamViewTypeId;
  current?: StreamSpecification;
}

export const getTimeToLive = async (dynamodb: DynamoDBClient, table: string) =>
  (await dynamodb.send(new DescribeTimeToLiveCommand({ TableName: table })))
    .TimeToLiveDescription ?? {};

export const updateTimeToLive = (
  dynamodb: DynamoDBClient,
  table: string,
  { enabled, attributeName }: TimeToLiveChange,
) =>
  dynamodb.send(
    new UpdateTimeToLiveCommand({
      TableName: table,
      TimeToLiveSpecification: { Enabled: enabled, AttributeName: attributeName },
    }),
  );

const setStream = (dynamodb: DynamoDBClient, table: string, specification: StreamSpecification) =>
  dynamodb.send(new UpdateTableCommand({ TableName: table, StreamSpecification: specification }));

// DynamoDB không cho đổi loại dữ liệu khi stream đang bật: tắt rồi bật lại (stream ARN đổi)
export async function updateStream(
  dynamodb: DynamoDBClient,
  table: string,
  { enabled, viewType, current }: StreamChange,
) {
  if (!enabled) return setStream(dynamodb, table, { StreamEnabled: false });
  if (current?.StreamEnabled) {
    if (current.StreamViewType === viewType) return undefined;
    await setStream(dynamodb, table, { StreamEnabled: false });
  }
  return setStream(dynamodb, table, { StreamEnabled: true, StreamViewType: viewType });
}
