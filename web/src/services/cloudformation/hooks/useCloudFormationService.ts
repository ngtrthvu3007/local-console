import { useMemo } from "react";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { createCloudFormationService } from "@localconsole/core/cloudformation";
import { useAwsClient } from "@shared/aws.ts";

export function useCloudFormationService() {
  const cloudformation = useAwsClient(CloudFormationClient);

  return useMemo(() => createCloudFormationService(cloudformation), [cloudformation]);
}
