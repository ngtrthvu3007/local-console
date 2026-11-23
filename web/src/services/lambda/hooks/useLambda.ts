import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { useAwsClient } from "@shared/aws.ts";

export const useLambda = () => ({
  lambda: useAwsClient(LambdaClient),
  logs: useAwsClient(CloudWatchLogsClient),
});
