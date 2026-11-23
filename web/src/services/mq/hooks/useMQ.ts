import { MqClient } from "@aws-sdk/client-mq";
import { useAwsClient } from "@shared/aws.ts";

export const useMQ = () => useAwsClient(MqClient);
