import type { ApiGatewayService } from "#services/apigateway/service.ts";
import { apiGatewaySourcesOf } from "#services/apigateway/lambdaPermissions.ts";
import type { CognitoService } from "#services/cognito/service.ts";
import type { EventBridgeService } from "#services/eventbridge/service.ts";
import {
  overlapMessage,
  overlappingRule,
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "#services/s3/notificationRules.ts";
import type { S3Service } from "#services/s3/service.ts";
import type { SecretsService } from "#services/secretsmanager/service.ts";
import type { SnsService } from "#services/sns/service.ts";
import { isArnOrQualified } from "#shared/utils/arn.ts";
import type { TriggerFormOutput } from "#services/lambda/schemas.ts";
import type { LambdaService } from "#services/lambda/service.ts";
import {
  apigatewayTriggerRows,
  cognitoRow,
  eventSourceRows,
  mappingRow,
  rotationRow,
  s3Row,
  sameRule,
  snsRow,
  targetsFunction,
  type TriggerRow,
} from "#services/lambda/triggerRows.ts";

export interface TriggerServices {
  lambda: LambdaService;
  s3: S3Service;
  sns: SnsService;
  eventbridge: EventBridgeService;
  cognito: CognitoService;
  apigateway: ApiGatewayService;
  secrets: SecretsService;
}

// streamArn: ARN stream của bảng (DynamoDB) hoặc của Kinesis stream đã chọn
export type AddTriggerInput = TriggerFormOutput & { streamArn?: string };

export interface FunctionRef {
  name: string;
  arn: string;
}

// S3 không có API sửa từng rule: đọc cả cấu hình của bucket, sửa danh sách rồi ghi lại
async function updateBucketRules(
  s3: S3Service,
  bucket: string,
  change: (rules: NotificationRule[]) => NotificationRule[],
) {
  const configuration = await s3.getBucketNotifications(bucket);
  await s3.saveBucketNotifications(
    bucket,
    toNotificationConfiguration(change(toNotificationRules(configuration)), configuration),
  );
}

// Local ít bucket nên đọc notification của mọi bucket song song
async function listS3Triggers(s3: S3Service, functionArn: string) {
  const buckets = await s3.listBuckets();
  const perBucket = await Promise.all(
    buckets.map(async ({ Name: bucket = "" }) =>
      toNotificationRules(await s3.getBucketNotifications(bucket))
        .filter((rule) => targetsFunction(rule, functionArn))
        .map((rule, index) => s3Row(bucket, rule, index)),
    ),
  );
  return perBucket.flat();
}

// Chỉ gọi danh sách API khi policy có nguồn API Gateway
async function listApiGatewayTriggers(
  lambda: LambdaService,
  apigateway: ApiGatewayService,
  functionName: string,
) {
  const sources = apiGatewaySourcesOf(await lambda.getPolicy(functionName));
  if (sources.length === 0) return [];

  const { rows, failures } = await apigateway.listApis();
  const hasUnknownApi = sources.some(({ apiId }) => !rows.some(({ id }) => id === apiId));
  // API không thấy có thể thuộc nửa bị lỗi: để lỗi hiện ra thay vì báo nhầm là đã xóa
  if (hasUnknownApi && failures.length > 0) throw failures[0].error;

  return apigatewayTriggerRows(sources, rows);
}

// Mọi nguồn gọi function, kể cả ARN có version / alias
export async function listTriggers(
  { lambda, s3, sns, eventbridge, cognito, apigateway, secrets }: TriggerServices,
  { name, arn }: FunctionRef,
): Promise<TriggerRow[]> {
  const matches = (target: string) => isArnOrQualified(target, arn);
  const rows = await Promise.all([
    listS3Triggers(s3, arn),
    lambda.listMappings({ functionName: name }).then((mappings) => mappings.map(mappingRow)),
    sns.listSubscriptionsOfEndpoint(matches).then((subscriptions) => subscriptions.map(snsRow)),
    eventbridge.listEventSources(matches).then(eventSourceRows),
    cognito.listPoolTriggers(arn).then((triggers) => triggers.map(cognitoRow)),
    secrets.listRotatedSecrets(arn).then((names) => names.map(rotationRow)),
    listApiGatewayTriggers(lambda, apigateway, name),
  ]);
  return rows.flat();
}

// Floci không cần AddPermission như AWS: S3, SQS, DynamoDB gọi được function mà không cần policy
export async function addTrigger(
  { lambda, s3 }: Pick<TriggerServices, "lambda" | "s3">,
  { name, arn }: FunctionRef,
  values: AddTriggerInput,
) {
  if (values.source === "s3") {
    const rule: NotificationRule = {
      id: "",
      destination: "lambda",
      arn,
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

  if (values.source === "dynamodb" || values.source === "kinesis") {
    return lambda.createStreamTrigger({
      ...values,
      functionName: name,
      streamArn: values.streamArn ?? "",
      batchSize: Number(values.batchSize),
    });
  }

  return lambda.createQueueTrigger({
    ...values,
    functionName: name,
    batchSize: Number(values.batchSize),
  });
}

export function deleteTrigger(
  { lambda, s3, sns }: Pick<TriggerServices, "lambda" | "s3" | "sns">,
  row: TriggerRow,
) {
  if (row.source === "s3")
    return updateBucketRules(s3, row.resource, (rules) =>
      rules.filter((rule) => !sameRule(rule, row.rule!)),
    );

  if (row.source === "sns") return sns.unsubscribe(row.subscriptionArn);
  return lambda.deleteMapping(row.mapping?.UUID);
}
