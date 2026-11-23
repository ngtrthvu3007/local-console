import { SSMClient } from "@aws-sdk/client-ssm";
import { useAwsClient } from "@shared/aws.ts";

export const useSSM = () => useAwsClient(SSMClient);
