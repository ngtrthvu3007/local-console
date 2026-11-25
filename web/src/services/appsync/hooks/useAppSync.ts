import { AppSyncClient } from "@aws-sdk/client-appsync";
import { useAwsClient } from "@shared/aws.ts";

export const useAppSync = () => useAwsClient(AppSyncClient);
