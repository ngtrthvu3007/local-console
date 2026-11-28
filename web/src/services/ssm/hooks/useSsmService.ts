import { useMemo } from "react";
import { SSMClient } from "@aws-sdk/client-ssm";
import { createSsmService } from "@localconsole/core/ssm";
import { useAwsClient } from "@shared/aws.ts";

export function useSsmService() {
  const ssm = useAwsClient(SSMClient);

  return useMemo(() => createSsmService(ssm), [ssm]);
}
