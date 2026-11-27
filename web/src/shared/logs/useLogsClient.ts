import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { useAwsClient } from "../aws.ts";

export const useLogsClient = () => useAwsClient(CloudWatchLogsClient);
