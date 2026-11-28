import { useMemo } from "react";
import { RDSClient } from "@aws-sdk/client-rds";
import { createRdsService } from "@localconsole/core/rds";
import { useAwsClient } from "@shared/aws.ts";

export function useRdsService() {
  const rds = useAwsClient(RDSClient);

  return useMemo(() => createRdsService(rds), [rds]);
}
