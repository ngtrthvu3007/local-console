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
import { UnsubscribeCommand, type SNSClient } from "@aws-sdk/client-sns";
import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import type { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { useCognito } from "../../cognito/hooks/useCognito.ts";
import { listPoolTriggers } from "../../cognito/hooks/usePools.ts";
import { cognitoRoutes, POOL_TABS } from "../../cognito/routes.ts";
import { listEventSources, targetsArn } from "../../eventbridge/eventSources.ts";
import { useEventBridge } from "../../eventbridge/hooks/useEventBridge.ts";
import { useScheduler } from "../../eventbridge/hooks/useScheduler.ts";
import { eventbridgeRoutes } from "../../eventbridge/routes.ts";
import { summarizeFilterPolicy } from "../../sns/filterPolicy.ts";
import { useSNS } from "../../sns/hooks/useSNS.ts";
import { listSubscriptionsOfEndpoint } from "../../sns/hooks/useSubscriptions.ts";
import { SNS_QUERY_ROOT } from "../../sns/hooks/useTopics.ts";
import { topicNameOfArn } from "../../sns/topics.ts";
import { useS3 } from "../../s3/hooks/useS3.ts";
import {
  overlapMessage,
  overlappingRule,
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "../../s3/notificationRules.ts";
import {
  DYNAMODB_ARN_PATTERN,
  KINESIS_ARN_PATTERN,
  type StartingPosition,
  type TriggerRowSource,
} from "../constants.ts";
import {
  mappingDetails,
  pickMappingOptions,
  toMappingParams,
  type MappingOptions,
} from "../mappingOptions.ts";
import type { TriggerFormOutput } from "../schemas.ts";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambda } from "./useLambda.ts";

const ARN_SEPARATOR = ":";

export interface TriggerRow {
  id: string;
  source: TriggerRowSource;
  resource: string; // tên bucket, queue, bảng, stream, topic SNS, rule, schedule hoặc user pool
  details: string;
  state?: string; // chỉ event source mapping (SQS, DynamoDB) có trạng thái bật/tắt
  rule?: NotificationRule; // S3: rule notification trỏ tới function
  uuid?: string; // SQS, DynamoDB: id của event source mapping
  sourceArn?: string; // SQS, DynamoDB: ARN của queue / stream mà mapping đọc
  subscriptionArn?: string; // SNS: subscription của topic tới function
  mapping?: EventSourceMappingConfiguration; // SQS, DynamoDB: cấu hình đầy đủ, để sửa
  href?: string; // EventBridge, Scheduler, Cognito: link sang rule / schedule / tab Triggers của pool
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
        configuration,
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

// "arn:aws:kinesis:…:stream/orders" → "orders"
const KINESIS_STREAM_MARKER = ":stream/";
const streamNameOf = (streamArn: string) =>
  streamArn.split(KINESIS_STREAM_MARKER)[1] ?? NOT_AVAILABLE;

// Nguồn của event source mapping lấy theo ARN; ARN không phải DynamoDB / Kinesis là SQS
export function mappingSourceOf(arn: string): Pick<TriggerRow, "source" | "resource"> {
  if (DYNAMODB_ARN_PATTERN.test(arn)) return { source: "dynamodb", resource: tableNameOf(arn) };
  if (KINESIS_ARN_PATTERN.test(arn)) return { source: "kinesis", resource: streamNameOf(arn) };
  return { source: "sqs", resource: arn.split(ARN_SEPARATOR).pop() ?? NOT_AVAILABLE };
}

function mappingRow(mapping: EventSourceMappingConfiguration): TriggerRow {
  const { source, resource } = mappingSourceOf(mapping.EventSourceArn ?? "");

  return {
    id: `mapping:${mapping.UUID}`,
    source,
    resource,
    details: mappingDetails(source, mapping),
    state: mapping.State,
    uuid: mapping.UUID,
    sourceArn: mapping.EventSourceArn,
    mapping,
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

// Subscription trỏ tới function, kể cả ARN có version/alias
async function listSnsTriggers(sns: SNSClient, functionArn: string) {
  const subscriptions = await listSubscriptionsOfEndpoint(
    sns,
    (endpoint) => endpoint === functionArn || endpoint.startsWith(`${functionArn}${ARN_SEPARATOR}`),
  );

  return subscriptions.map((subscription): TriggerRow => ({
    id: `sns:${subscription.arn}`,
    source: "sns",
    resource: topicNameOfArn(subscription.topicArn),
    details: summarizeFilterPolicy(subscription.filterPolicy),
    subscriptionArn: subscription.arn,
  }));
}

// Rule và schedule của EventBridge có đích là function, kể cả ARN có version / alias
async function listEventBridgeTriggers(
  events: EventBridgeClient,
  scheduler: SchedulerClient,
  functionArn: string,
) {
  const { rules, schedules } = await listEventSources(events, scheduler, (target) =>
    targetsArn(target, functionArn, true),
  );

  return [
    ...rules.map(({ bus, rule }): TriggerRow => ({
      id: `eventbridge:${bus}/${rule}`,
      source: "eventbridge",
      resource: rule,
      details: `Bus ${bus}`,
      href: eventbridgeRoutes.rule(bus, rule),
    })),
    ...schedules.map(({ group, name }): TriggerRow => ({
      id: `scheduler:${group}/${name}`,
      source: "scheduler",
      resource: name,
      details: `Group ${group}`,
      href: eventbridgeRoutes.schedule(group, name),
    })),
  ];
}

// Trigger của user pool trỏ tới function: sửa ở tab Triggers của pool
async function listCognitoTriggers(cognito: CognitoIdentityProviderClient, functionArn: string) {
  const triggers = await listPoolTriggers(cognito, functionArn);

  return triggers.map(({ poolId, poolName, label }): TriggerRow => ({
    id: `cognito:${poolId}:${label}`,
    source: "cognito",
    resource: poolName,
    details: label,
    href: cognitoRoutes.pool(poolId, POOL_TABS.triggers),
  }));
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
  const sns = useSNS();
  const events = useEventBridge();
  const scheduler = useScheduler();
  const cognito = useCognito();

  return useQuery({
    queryKey: triggersQueryKey(functionName),
    queryFn: async () => {
      const [s3Rows, mappingRows, snsRows, eventBridgeRows, cognitoRows] = await Promise.all([
        listS3Triggers(s3, functionArn),
        listMappingTriggers(lambda, functionName),
        listSnsTriggers(sns, functionArn),
        listEventBridgeTriggers(events, scheduler, functionArn),
        listCognitoTriggers(cognito, functionArn),
      ]);

      return [...s3Rows, ...mappingRows, ...snsRows, ...eventBridgeRows, ...cognitoRows];
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(functionName) }),
        // Xóa trigger SNS là xóa subscription, nên danh sách bên SNS cũng đổi
        queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT] }),
      ]),
  });
}

export interface StreamTriggerInput extends MappingOptions {
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
      ...toMappingParams("dynamodb", input),
    }),
  );

export interface QueueTriggerInput extends MappingOptions {
  functionName: string;
  queueArn: string;
  batchSize: number;
  enabled: boolean;
}

// Dùng chung cho tab Triggers của Lambda và nút Add trigger ở trang queue SQS
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

      return updateBucketRules(s3, values.bucket, (rules) => {
        const overlap = overlappingRule(rules, rule);
        if (overlap) throw new Error(overlapMessage(overlap));
        return [...rules, rule];
      });
    }

    if (values.source === "dynamodb") {
      return createStreamTrigger(lambda, {
        functionName,
        streamArn: values.streamArn ?? "",
        startingPosition: values.startingPosition,
        batchSize: Number(values.batchSize),
        enabled: values.enabled,
        ...pickMappingOptions(values),
      });
    }

    return createQueueTrigger(lambda, {
      functionName,
      queueArn: values.queueArn,
      batchSize: Number(values.batchSize),
      enabled: values.enabled,
      ...pickMappingOptions(values),
    });
  });
}

export function useDeleteTrigger(functionName: string) {
  const { lambda } = useLambda();
  const { s3 } = useS3();
  const sns = useSNS();

  return useTriggerMutation(functionName, (row: TriggerRow) => {
    if (row.source === "s3")
      return updateBucketRules(s3, row.resource, (rules) =>
        rules.filter((rule) => !sameRule(rule, row.rule!)),
      );

    if (row.source === "sns")
      return sns.send(new UnsubscribeCommand({ SubscriptionArn: row.subscriptionArn }));
    return lambda.send(new DeleteEventSourceMappingCommand({ UUID: row.uuid }));
  });
}

interface EditTriggerInput {
  row: TriggerRow;
  batchSize: number;
  options: MappingOptions;
}

// UpdateEventSourceMapping ghi đè cả cấu hình nên gửi đủ các ô (xem toMappingParams)
export function useEditTrigger(functionName: string) {
  const { lambda } = useLambda();

  return useTriggerMutation(functionName, ({ row, batchSize, options }: EditTriggerInput) =>
    lambda.send(
      new UpdateEventSourceMappingCommand({
        UUID: row.uuid,
        BatchSize: batchSize,
        ...toMappingParams(row.source === "sqs" ? "sqs" : "dynamodb", options),
      }),
    ),
  );
}

export function useSetTriggerEnabled(functionName: string) {
  const { lambda } = useLambda();

  return useTriggerMutation(functionName, ({ uuid, enabled }: { uuid: string; enabled: boolean }) =>
    lambda.send(new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: enabled })),
  );
}
