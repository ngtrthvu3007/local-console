import { RDSClient } from "@aws-sdk/client-rds";
import { useAwsClient } from "@shared/aws.ts";

export const useRDS = () => useAwsClient(RDSClient);
