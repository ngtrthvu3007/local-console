import { useMemo } from "react";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { createEventBridgeService } from "@localconsole/core/eventbridge";
import { useAwsClient } from "@shared/aws.ts";

export function useEventBridgeService() {
  const events = useAwsClient(EventBridgeClient);
  const scheduler = useAwsClient(SchedulerClient);

  return useMemo(() => createEventBridgeService(events, { scheduler }), [events, scheduler]);
}
