import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { useAwsClient } from "@shared/aws.ts";

export const useCloudFormation = () => useAwsClient(CloudFormationClient);
