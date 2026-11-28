import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { SQSClient } from "@aws-sdk/client-sqs";
import { createLambdaService } from "@localconsole/core/lambda";
import { createLogsService } from "@localconsole/core/logs";
import { createSecretsService } from "@localconsole/core/secretsmanager";
import { createSesService } from "@localconsole/core/ses";
import { awsClient, createFlociService } from "@localconsole/core/shared";
import { createSqsService } from "@localconsole/core/sqs";
import type { Config } from "../config.ts";

// Composition root của server: tạo facade một lần lúc khởi động, tool chỉ gọi method của facade.
// Gọi thẳng Floci (AWS_ENDPOINT_URL), không qua proxy /aws như web
export function createServices(config: Config) {
  const options = { region: config.AWS_REGION, endpoint: config.AWS_ENDPOINT_URL };
  const flociUrl = config.AWS_ENDPOINT_URL;
  const lambda = createLambdaService(awsClient(LambdaClient, options), {
    logs: createLogsService(awsClient(CloudWatchLogsClient, options)),
    secrets: createSecretsService(awsClient(SecretsManagerClient, options)),
    // Code.Location trỏ host nội bộ của Floci: server tới được nên giữ nguyên
    codeUrl: (location) => location,
  });

  return {
    floci: createFlociService(flociUrl),
    sqs: createSqsService(awsClient(SQSClient, options), {
      lambda,
      flociUrl,
      region: config.AWS_REGION,
    }),
    ses: createSesService(awsClient(SESv2Client, options), {
      flociUrl,
      region: config.AWS_REGION,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
