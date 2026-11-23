import {
  GetBucketNotificationConfigurationCommand,
  ListBucketsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { ListEventSourceMappingsCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { targetsArn } from "../eventbridge/eventSources.ts";
import { functionNameOfMapping } from "../lambda/helpers.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../lambda/routes.ts";
import { s3Routes } from "../s3/routes.ts";
import { toNotificationRules } from "../s3/notificationRules.ts";
import { sesRoutes } from "../ses/routes.ts";
import { listAsyncDestinations, listSetDestinations } from "./scans.ts";

// Một nguồn đang gửi vào resource (queue, topic hoặc function) thông qua cấu hình ở service khác
export interface Sender {
  id: string;
  type: string;
  name: string;
  detail: string;
  href: string;
}

interface SenderClients {
  s3: S3Client;
  lambda: LambdaClient;
  ses: SESv2Client;
}

// ARN function có thể kèm version / alias (my-function:prod); queue, topic thì khớp đúng ARN
const refersTo = (candidate: string | undefined, arn: string) =>
  candidate !== undefined && targetsArn(candidate, arn, true);

// S3 notification trỏ tới resource. Function đã có dòng S3 trong bảng Triggers nên không quét
async function fromS3(s3: S3Client, arn: string): Promise<Sender[]> {
  const buckets = (await s3.send(new ListBucketsCommand({}))).Buckets ?? [];

  const perBucket = await Promise.all(
    buckets.map(async ({ Name: bucket = "" }) =>
      toNotificationRules(
        await s3.send(new GetBucketNotificationConfigurationCommand({ Bucket: bucket })),
      )
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
async function fromLambda(lambda: LambdaClient, arn: string): Promise<Sender[]> {
  const [functions, mappings] = await Promise.all([
    listAsyncDestinations(lambda),
    // Không nêu FunctionName: trả trigger của mọi function trong một lượt
    lambda.send(new ListEventSourceMappingsCommand({})),
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

  const onFailure = (mappings.EventSourceMappings ?? [])
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
async function fromSes(ses: SESv2Client, arn: string): Promise<Sender[]> {
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

export type SenderKind = "s3" | "lambda" | "ses";

// Chỉ quét các nguồn mà loại resource này có thể nhận: queue và topic nhận S3, Lambda; topic thêm SES;
// function chỉ nhận đích async của function khác
export async function listSenders(
  clients: SenderClients,
  arn: string,
  kinds: readonly SenderKind[],
): Promise<Sender[]> {
  const found = await Promise.all([
    kinds.includes("s3") ? fromS3(clients.s3, arn) : [],
    kinds.includes("lambda") ? fromLambda(clients.lambda, arn) : [],
    kinds.includes("ses") ? fromSes(clients.ses, arn) : [],
  ]);

  return found.flat();
}
