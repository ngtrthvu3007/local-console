import { KinesisClient } from "@aws-sdk/client-kinesis";
import { useAwsClient } from "@shared/aws.ts";

export const useKinesis = () => useAwsClient(KinesisClient);
