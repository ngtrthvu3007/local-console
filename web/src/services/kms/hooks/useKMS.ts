import { KMSClient } from "@aws-sdk/client-kms";
import { useAwsClient } from "@shared/aws.ts";

export const useKMS = () => useAwsClient(KMSClient);
