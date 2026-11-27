import { isArnOrQualified } from "#shared/utils/arn.ts";
import { functionNameOfMapping } from "#services/lambda/helpers.ts";
import { FUNCTION_TABS, lambdaRoutes } from "#services/lambda/paths.ts";
import type { LambdaService } from "#services/lambda/service.ts";
import { toNotificationRules } from "#services/s3/notificationRules.ts";
import { s3Routes } from "#services/s3/paths.ts";
import type { S3Service } from "#services/s3/service.ts";
import { sesRoutes } from "#services/ses/paths.ts";
import {
  listAsyncDestinations,
  listSetDestinations,
  type AsyncScanLambda,
  type SetScanSes,
} from "./scans.ts";

// Một nguồn đang gửi vào resource (queue, topic, function hoặc bus) thông qua cấu hình ở service khác
export interface Sender {
  id: string;
  type: string;
  name: string;
  detail: string;
  href: string;
}

export type SenderKind = "s3" | "lambda" | "ses";

export interface SenderServices {
  s3: Pick<S3Service, "listBuckets" | "getBucketNotifications">;
  lambda: AsyncScanLambda & Pick<LambdaService, "listMappings">;
  ses: SetScanSes;
}

// ARN function có thể kèm version / alias (my-function:prod); queue, topic thì khớp đúng ARN
const refersTo = (candidate: string | undefined, arn: string) =>
  candidate !== undefined && isArnOrQualified(candidate, arn);

// S3 notification trỏ tới resource. Function đã có dòng S3 trong bảng Triggers nên không quét
async function fromS3(s3: SenderServices["s3"], arn: string): Promise<Sender[]> {
  const buckets = await s3.listBuckets();

  const perBucket = await Promise.all(
    buckets.map(async ({ Name: bucket = "" }) =>
      toNotificationRules(await s3.getBucketNotifications(bucket))
        .filter((rule) => refersTo(rule.arn, arn))
        .map((rule) => ({
          id: `s3:${bucket}/${rule.id}`,
          type: "S3 notification",
          name: bucket,
          detail: rule.events.join(", "),
          href: s3Routes.bucket(bucket),
        })),
    ),
  );

  return perBucket.flat();
}

// Đích async (On success / On failure) của mọi function, và đích lỗi của trigger (queue / topic)
async function fromLambda(lambda: SenderServices["lambda"], arn: string): Promise<Sender[]> {
  const [functions, mappings] = await Promise.all([
    listAsyncDestinations(lambda),
    // Không lọc theo function: trả trigger của mọi function trong một lượt
    lambda.listMappings({}),
  ]);

  const async = functions.flatMap(({ name, onSuccess, onFailure }) =>
    (
      [
        ["success", onSuccess],
        ["failure", onFailure],
      ] as const
    )
      .filter(([, destination]) => refersTo(destination, arn))
      .map(([outcome]) => ({
        id: `lambda-async:${name}:${outcome}`,
        type: "Lambda async",
        name,
        detail: `On ${outcome}`,
        href: lambdaRoutes.function(name),
      })),
  );

  const onFailure = mappings
    .filter((mapping) => refersTo(mapping.DestinationConfig?.OnFailure?.Destination, arn))
    .map((mapping) => {
      const name = functionNameOfMapping(mapping);

      return {
        id: `lambda-trigger:${mapping.UUID}`,
        type: "Lambda trigger",
        name,
        detail: "On failure",
        href: lambdaRoutes.function(name, FUNCTION_TABS.triggers),
      };
    });

  return [...async, ...onFailure];
}

// Configuration set của SES có destination SNS trỏ tới topic
async function fromSes(ses: SetScanSes, arn: string): Promise<Sender[]> {
  return (await listSetDestinations(ses))
    .filter(({ destinations }) =>
      destinations.some((destination) => destination.SnsDestination?.TopicArn === arn),
    )
    .map(({ name }) => ({
      id: `ses:${name}`,
      type: "SES configuration set",
      name,
      detail: "Mail events",
      href: sesRoutes.configurationSetPage(name),
    }));
}

// Chỉ quét các nguồn mà loại resource này có thể nhận: queue và topic nhận S3, Lambda; topic thêm SES;
// function chỉ nhận đích async của function khác
export async function listSenders(
  services: SenderServices,
  arn: string,
  kinds: readonly SenderKind[],
): Promise<Sender[]> {
  const found = await Promise.all([
    kinds.includes("s3") ? fromS3(services.s3, arn) : [],
    kinds.includes("lambda") ? fromLambda(services.lambda, arn) : [],
    kinds.includes("ses") ? fromSes(services.ses, arn) : [],
  ]);

  return found.flat();
}
