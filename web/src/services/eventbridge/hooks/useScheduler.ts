import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { useAwsClient } from "@shared/aws.ts";

export const useScheduler = () => useAwsClient(SchedulerClient);
