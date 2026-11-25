import type {
  CreateEventSourceMappingCommandInput,
  EventSourceMappingConfiguration,
} from "@aws-sdk/client-lambda";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { reformatJson } from "@shared/json.ts";
import { resourceNameOfArn } from "../eventbridge/targets.ts";
import {
  REPORT_BATCH_FAILURES,
  STARTING_POSITIONS,
  STREAM_RECORD_AGE_SECONDS,
  STREAM_RETRY_ATTEMPTS,
  type OnFailureKind,
  type StartingPosition,
  type TriggerRowSource,
} from "./constants.ts";

// Nguồn có tùy chọn nâng cao; S3 và SNS không phải event source mapping
export type MappingSource = "sqs" | "dynamodb" | "kinesis";

// Các ô của form, gộp chung cho SQS và DynamoDB: mỗi nguồn chỉ dùng phần của mình
export interface MappingOptions {
  filterPatterns: { pattern: string }[];
  reportBatchFailures: boolean; // SQS
  retryAttempts: string; // stream
  maxRecordAge: string; // stream
  onFailureKind: OnFailureKind; // stream
  onFailureArn: string; // stream
}

export const DEFAULT_MAPPING_OPTIONS: MappingOptions = {
  filterPatterns: [],
  reportBatchFailures: false,
  retryAttempts: String(STREAM_RETRY_ATTEMPTS.default),
  maxRecordAge: String(STREAM_RECORD_AGE_SECONDS.forever),
  onFailureKind: "none",
  onFailureArn: "",
};

// Lấy đúng các ô tùy chọn từ giá trị của form (form có thêm nhiều ô khác)
export const pickMappingOptions = (values: MappingOptions): MappingOptions => ({
  filterPatterns: values.filterPatterns,
  reportBatchFailures: values.reportBatchFailures,
  retryAttempts: values.retryAttempts,
  maxRecordAge: values.maxRecordAge,
  onFailureKind: values.onFailureKind,
  onFailureArn: values.onFailureArn,
});

type MappingParams = Pick<
  CreateEventSourceMappingCommandInput,
  | "FilterCriteria"
  | "FunctionResponseTypes"
  | "MaximumRetryAttempts"
  | "MaximumRecordAgeInSeconds"
  | "DestinationConfig"
>;

// Tham số cho Create và Update. Filters rỗng gỡ filter, DestinationConfig rỗng gỡ đích lỗi
// (Update ghi đè nên phải gửi đủ cả khi không có gì)
export function toMappingParams(source: MappingSource, options: MappingOptions): MappingParams {
  const filters = options.filterPatterns
    .map(({ pattern }) => pattern.trim())
    .filter(Boolean)
    .map((Pattern) => ({ Pattern }));

  const common = { FilterCriteria: { Filters: filters } };

  if (source === "sqs")
    return {
      ...common,
      FunctionResponseTypes: options.reportBatchFailures ? [REPORT_BATCH_FAILURES] : [],
    };

  return {
    ...common,
    MaximumRetryAttempts: Number(options.retryAttempts),
    MaximumRecordAgeInSeconds: Number(options.maxRecordAge),
    DestinationConfig:
      options.onFailureKind === "none" ? {} : { OnFailure: { Destination: options.onFailureArn } },
  };
}

// SNS hay SQS theo ARN đích; ARN lạ coi là SQS (Floci chỉ nhận hai loại này)
const onFailureKindOf = (arn: string): OnFailureKind =>
  !arn ? "none" : arn.includes(":sns:") ? "sns" : "sqs";

// Trigger có sẵn (kể cả tạo bằng IaC) → các ô của form; hiện đủ pattern, không bỏ pattern nào
export function fromMapping(mapping: EventSourceMappingConfiguration): MappingOptions {
  const destination = mapping.DestinationConfig?.OnFailure?.Destination ?? "";

  return {
    filterPatterns: (mapping.FilterCriteria?.Filters ?? []).map((filter) => ({
      pattern: reformatJson(filter.Pattern ?? ""),
    })),
    reportBatchFailures: Boolean(mapping.FunctionResponseTypes?.includes(REPORT_BATCH_FAILURES)),
    retryAttempts: String(mapping.MaximumRetryAttempts ?? STREAM_RETRY_ATTEMPTS.default),
    maxRecordAge: String(mapping.MaximumRecordAgeInSeconds ?? STREAM_RECORD_AGE_SECONDS.forever),
    onFailureKind: onFailureKindOf(destination),
    onFailureArn: destination,
  };
}

// Cột Details của Lambda › Triggers: "Batch size 10 · Filter · Partial batch" hoặc
// "Batch size 100 · Latest · Retry 2 · On failure: SQS orders-dlq"
export function mappingDetails(source: TriggerRowSource, mapping: EventSourceMappingConfiguration) {
  const startingPosition = mapping.StartingPosition as StartingPosition | undefined;
  const destination = mapping.DestinationConfig?.OnFailure?.Destination;
  const retry = mapping.MaximumRetryAttempts;

  return [
    `Batch size ${mapping.BatchSize}`,
    startingPosition && STARTING_POSITIONS[startingPosition],
    mapping.FilterCriteria?.Filters?.length && "Filter",
    source === "sqs" &&
      mapping.FunctionResponseTypes?.includes(REPORT_BATCH_FAILURES) &&
      "Partial batch",
    (source === "dynamodb" || source === "kinesis") &&
      retry !== undefined &&
      retry !== STREAM_RETRY_ATTEMPTS.default &&
      `Retry ${retry}`,
    destination &&
      `On failure: ${onFailureKindOf(destination).toUpperCase()} ${resourceNameOfArn(destination)}`,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
}
