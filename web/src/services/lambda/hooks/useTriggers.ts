import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateEventSourceMappingCommand,
  DeleteEventSourceMappingCommand,
  paginateListEventSourceMappings,
  UpdateEventSourceMappingCommand,
  type EventSourceMappingConfiguration,
  type LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  GetBucketNotificationConfigurationCommand,
  ListBucketsCommand,
  PutBucketNotificationConfigurationCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useS3 } from "../../s3/hooks/useS3.ts";
import {
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "../../s3/notificationRules.ts";
import {
  DYNAMODB_ARN_PATTERN,
  STARTING_POSITIONS,
  type StartingPosition,
  type TriggerSource,
} from "../constants.ts";
import type { TriggerFormOutput } from "../schemas.ts";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambda } from "./useLambda.ts";

const ARN_SEPARATOR = ":";
const DETAIL_SEPARATOR = " · ";

export interface TriggerRow {
  id: string;
  source: TriggerSource;
  resource: string; // tên bucket, queue hoặc bảng DynamoDB
  details: string;
  state?: string; // chỉ event source mapping (SQS, DynamoDB) có trạng thái bật/tắt
  rule?: NotificationRule; // S3: rule notification trỏ tới function
  uuid?: string; // SQS, DynamoDB: id của event source mapping
}

// Rule trỏ tới function, kể cả ARN có version/alias (my-function:prod)
const targetsFunction = (rule: NotificationRule, functionArn: string) =>
  rule.destination === "lambda" &&
  (rule.arn === functionArn || rule.arn.startsWith(`${functionArn}${ARN_SEPARATOR}`));

// S3 không có API sửa từng rule: đọc cả cấu hình của bucket, sửa danh sách rồi ghi lại
async function updateBucketRules(
  s3: S3Client,
  bucket: string,
  change: (rules: NotificationRule[]) => NotificationRule[],
) {
  const { $metadata: _metadata, ...configuration } = await s3.send(
    new GetBucketNotificationConfigurationCommand({ Bucket: bucket }),
  );
  await s3.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucket,
      NotificationConfiguration: toNotificationConfiguration(
        change(toNotificationRules(configuration)),
      ),
    }),
  );
}

const sameRule = (left: NotificationRule, right: NotificationRule) =>
  JSON.stringify(left) === JSON.stringify(right);

const s3Row = (bucket: string, rule: NotificationRule, index: number): TriggerRow => ({
  id: `s3:${bucket}:${index}`,
  source: "s3",
  resource: bucket,
  details: [rule.events.join(", "), rule.prefix, rule.suffix]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR),
  rule,
});

// "arn:aws:dynamodb:…:table/orders/stream/2026-…" → "orders"
const DYNAMODB_TABLE_MARKER = ":table/";
const DYNAMODB_STREAM_MARKER = "/stream/";
const tableNameOf = (streamArn: string) =>
  streamArn.split(DYNAMODB_TABLE_MARKER)[1]?.split(DYNAMODB_STREAM_MARKER)[0] ?? NOT_AVAILABLE;

// Nguồn của event source mapping lấy theo ARN (trước đây mọi mapping đều bị ghi là SQS)
function mappingRow(mapping: EventSourceMappingConfiguration): TriggerRow {
  const arn = mapping.EventSourceArn ?? "";
  const fromDynamoDB = DYNAMODB_ARN_PATTERN.test(arn);
  const startingPosition = mapping.StartingPosition as StartingPosition | undefined;
  return {
    id: `mapping:${mapping.UUID}`,
    source: fromDynamoDB ? "dynamodb" : "sqs",
    resource: fromDynamoDB ? tableNameOf(arn) : (arn.split(ARN_SEPARATOR).pop() ?? NOT_AVAILABLE),
    details: [
      `Batch size ${mapping.BatchSize}`,
      startingPosition && STARTING_POSITIONS[startingPosition],
    ]
      .filter(Boolean)
      .join(DETAIL_SEPARATOR),
    state: mapping.State,
    uuid: mapping.UUID,
  };
}

// Local ít bucket nên đọc notification của mọi bucket song song
async function listS3Triggers(s3: S3Client, functionArn: string) {
  const buckets = (await s3.send(new ListBucketsCommand({}))).Buckets ?? [];
  const perBucket = await Promise.all(
    buckets.map(async ({ Name: bucket = "" }) => {
      const configuration = await s3.send(
        new GetBucketNotificationConfigurationCommand({ Bucket: bucket }),
      );
      return toNotificationRules(configuration)
        .filter((rule) => targetsFunction(rule, functionArn))
        .map((rule, index) => s3Row(bucket, rule, index));
    }),
  );
  return perBucket.flat();
}

async function listMappingTriggers(lambda: LambdaClient, functionName: string) {
  const rows: TriggerRow[] = [];
  const paginator = paginateListEventSourceMappings(
    { client: lambda },
    { FunctionName: functionName },
  );
  for await (const page of paginator) {
    rows.push(...(page.EventSourceMappings ?? []).map(mappingRow));
  }
  return rows;
}

const triggersQueryKey = (functionName: string) => functionQueryKey(functionName, "triggers");

export function useTriggers(functionName: string, functionArn: string) {
  const { lambda } = useLambda();
  const { s3 } = useS3();
  return useQuery({
    queryKey: triggersQueryKey(functionName),
    queryFn: async () => {
      const [s3Rows, mappingRows] = await Promise.all([
        listS3Triggers(s3, functionArn),
        listMappingTriggers(lambda, functionName),
      ]);
      return [...s3Rows, ...mappingRows];
    },
  });
}

function useTriggerMutation<TInput>(
  functionName: string,
  run: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: triggersQueryKey(functionName) }),
  });
}

export interface StreamTriggerInput {
  functionName: string;
  streamArn: string;
  startingPosition: StartingPosition;
  batchSize: number;
  enabled: boolean;
}

// Dùng chung cho tab Triggers của Lambda và nút Add trigger ở trang bảng DynamoDB
export const createStreamTrigger = (lambda: LambdaClient, input: StreamTriggerInput) =>
  lambda.send(
    new CreateEventSourceMappingCommand({
      FunctionName: input.functionName,
      EventSourceArn: input.streamArn,
      StartingPosition: input.startingPosition,
      BatchSize: input.batchSize,
      Enabled: input.enabled,
    }),
  );

// streamArn: Stream ARN của bảng đã chọn (chỉ với nguồn DynamoDB)
export type AddTriggerInput = TriggerFormOutput & { streamArn?: string };

// Floci không cần AddPermission như AWS: S3, SQS, DynamoDB gọi được function mà không cần policy
export function useAddTrigger(functionName: string, functionArn: string) {
  const { lambda } = useLambda();
  const { s3 } = useS3();
  return useTriggerMutation(functionName, async (values: AddTriggerInput) => {
    if (values.source === "s3") {
      const rule: NotificationRule = {
        id: "",
        destination: "lambda",
        arn: functionArn,
        events: values.events,
        prefix: values.prefix,
        suffix: values.suffix,
      };
      return updateBucketRules(s3, values.bucket, (rules) => [...rules, rule]);
    }
    if (values.source === "dynamodb") {
      return createStreamTrigger(lambda, {
        functionName,
        streamArn: values.streamArn ?? "",
        startingPosition: values.startingPosition,
        batchSize: Number(values.batchSize),
        enabled: values.enabled,
      });
    }
    return lambda.send(
      new CreateEventSourceMappingCommand({
        FunctionName: functionName,
        EventSourceArn: values.queueArn,
        BatchSize: Number(values.batchSize),
        Enabled: values.enabled,
      }),
    );
  });
}

export function useDeleteTrigger(functionName: string) {
  const { lambda } = useLambda();
  const { s3 } = useS3();
  return useTriggerMutation(functionName, (row: TriggerRow) =>
    row.source === "s3"
      ? updateBucketRules(s3, row.resource, (rules) =>
          rules.filter((rule) => !sameRule(rule, row.rule!)),
        )
      : lambda.send(new DeleteEventSourceMappingCommand({ UUID: row.uuid })),
  );
}

export function useSetTriggerEnabled(functionName: string) {
  const { lambda } = useLambda();
  return useTriggerMutation(functionName, ({ uuid, enabled }: { uuid: string; enabled: boolean }) =>
    lambda.send(new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: enabled })),
  );
}
