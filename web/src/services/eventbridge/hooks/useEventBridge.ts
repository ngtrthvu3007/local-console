import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { useAwsClient } from "@shared/aws.ts";

export const useEventBridge = () => useAwsClient(EventBridgeClient);
