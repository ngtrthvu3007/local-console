import { SQSClient } from "@aws-sdk/client-sqs";
import { useAwsClient } from "@shared/aws.ts";

// Có endpoint riêng thì SDK không lấy host từ QueueUrl (localhost:4566), nên vẫn đi qua /aws
export const useSQS = () => useAwsClient(SQSClient);
