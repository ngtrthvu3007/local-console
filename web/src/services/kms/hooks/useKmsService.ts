import { useMemo } from "react";
import { KMSClient } from "@aws-sdk/client-kms";
import { createKmsService } from "@localconsole/core/kms";
import { useAwsClient } from "@shared/aws.ts";

export function useKmsService() {
  const kms = useAwsClient(KMSClient);

  return useMemo(() => createKmsService(kms), [kms]);
}
