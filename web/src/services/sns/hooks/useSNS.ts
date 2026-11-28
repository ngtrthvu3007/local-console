import { SNSClient } from "@aws-sdk/client-sns";
import { useAwsClient } from "@shared/aws.ts";

export const useSNS = () => useAwsClient(SNSClient);
