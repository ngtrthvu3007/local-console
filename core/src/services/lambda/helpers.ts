import type {
  EventSourceMappingConfiguration,
  FunctionConfiguration,
} from "@aws-sdk/client-lambda";
import { ARN_SEPARATOR, lastArnPart } from "#shared/utils/arn.ts";
import { NOT_AVAILABLE } from "#shared/constants.ts";
import {
  DYNAMODB_ARN_PATTERN,
  KINESIS_ARN_PATTERN,
  LOG_GROUP_PREFIX,
  type TriggerRowSource,
} from "./constants.ts";

export const logGroupOf = (configuration: FunctionConfiguration) =>
  configuration.LoggingConfig?.LogGroup ?? `${LOG_GROUP_PREFIX}${configuration.FunctionName}`;

const FUNCTION_ARN_MARKER = ":function:";

export const functionNameOfArn = (arn: string) =>
  arn.split(FUNCTION_ARN_MARKER)[1]?.split(ARN_SEPARATOR)[0] ?? NOT_AVAILABLE;

export const functionNameOfMapping = (mapping: EventSourceMappingConfiguration) =>
  mapping.FunctionArn?.split(FUNCTION_ARN_MARKER)[1] ?? NOT_AVAILABLE;

const DYNAMODB_TABLE_MARKER = ":table/";
const DYNAMODB_STREAM_MARKER = "/stream/";
const tableNameOf = (streamArn: string) =>
  streamArn.split(DYNAMODB_TABLE_MARKER)[1]?.split(DYNAMODB_STREAM_MARKER)[0] ?? NOT_AVAILABLE;

const KINESIS_STREAM_MARKER = ":stream/";
const streamNameOf = (streamArn: string) =>
  streamArn.split(KINESIS_STREAM_MARKER)[1] ?? NOT_AVAILABLE;

export function mappingSourceOf(arn: string): { source: TriggerRowSource; resource: string } {
  if (DYNAMODB_ARN_PATTERN.test(arn)) return { source: "dynamodb", resource: tableNameOf(arn) };
  if (KINESIS_ARN_PATTERN.test(arn)) return { source: "kinesis", resource: streamNameOf(arn) };
  return { source: "sqs", resource: lastArnPart(arn) };
}
