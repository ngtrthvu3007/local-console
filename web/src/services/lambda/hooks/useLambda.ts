import { LambdaClient } from "@aws-sdk/client-lambda";
import { useAwsClient } from "@shared/aws.ts";
import { useLogsClient } from "@shared/logs/useLogsClient.ts";

export const useLambda = () => ({
  lambda: useAwsClient(LambdaClient),
  logs: useLogsClient(),
});
