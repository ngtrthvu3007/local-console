import { SFNClient } from "@aws-sdk/client-sfn";
import { useAwsClient } from "@shared/aws.ts";

export const useSFN = () => useAwsClient(SFNClient);
