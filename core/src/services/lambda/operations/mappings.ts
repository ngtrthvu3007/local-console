import {
  CreateEventSourceMappingCommand,
  DeleteEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
  paginateListEventSourceMappings,
  UpdateEventSourceMappingCommand,
  type LambdaClient,
} from "@aws-sdk/client-lambda";
import { collectPages } from "#shared/aws/pagination.ts";
import type { StartingPosition, TriggerRowSource } from "#services/lambda/constants.ts";
import { toMappingParams, type MappingOptions } from "#services/lambda/mappingOptions.ts";

export interface StreamTriggerInput extends MappingOptions {
  functionName: string;
  streamArn: string;
  startingPosition: StartingPosition;
  batchSize: number;
  enabled: boolean;
}

export interface QueueTriggerInput extends MappingOptions {
  functionName: string;
  queueArn: string;
  batchSize: number;
  enabled: boolean;
}

export interface EditMappingInput {
  uuid?: string;
  source: TriggerRowSource;
  batchSize: number;
  options: MappingOptions;
}

export async function listMappings(
  lambda: LambdaClient,
  filter: { functionName?: string; sourceArn?: string },
) {
  const paginator = paginateListEventSourceMappings(
    { client: lambda },
    { FunctionName: filter.functionName, EventSourceArn: filter.sourceArn },
  );

  return collectPages(paginator, (page) => page.EventSourceMappings);
}

// Để cảnh báo khi xóa nguồn: chỉ cần biết có hay không, nên chỉ đọc trang đầu
export const hasMappings = async (lambda: LambdaClient, sourceArn: string) =>
  Boolean(
    (await lambda.send(new ListEventSourceMappingsCommand({ EventSourceArn: sourceArn })))
      .EventSourceMappings?.length,
  );

export const createStreamTrigger = (lambda: LambdaClient, input: StreamTriggerInput) =>
  lambda.send(
    new CreateEventSourceMappingCommand({
      FunctionName: input.functionName,
      EventSourceArn: input.streamArn,
      StartingPosition: input.startingPosition,
      BatchSize: input.batchSize,
      Enabled: input.enabled,
      ...toMappingParams("dynamodb", input),
    }),
  );

export const createQueueTrigger = (lambda: LambdaClient, input: QueueTriggerInput) =>
  lambda.send(
    new CreateEventSourceMappingCommand({
      FunctionName: input.functionName,
      EventSourceArn: input.queueArn,
      BatchSize: input.batchSize,
      Enabled: input.enabled,
      ...toMappingParams("sqs", input),
    }),
  );

export const deleteMapping = (lambda: LambdaClient, uuid?: string) =>
  lambda.send(new DeleteEventSourceMappingCommand({ UUID: uuid }));

// UpdateEventSourceMapping ghi đè cả cấu hình nên gửi đủ các ô (xem toMappingParams)
export const editMapping = (
  lambda: LambdaClient,
  { uuid, source, batchSize, options }: EditMappingInput,
) =>
  lambda.send(
    new UpdateEventSourceMappingCommand({
      UUID: uuid,
      BatchSize: batchSize,
      ...toMappingParams(source === "sqs" ? "sqs" : "dynamodb", options),
    }),
  );

export const setMappingEnabled = (
  lambda: LambdaClient,
  { uuid, enabled }: { uuid: string; enabled: boolean },
) => lambda.send(new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: enabled }));
