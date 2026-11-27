import { useMemo } from "react";
import { RDSClient } from "@aws-sdk/client-rds";
import { createDocDbService } from "@localconsole/core/docdb";
import { useAwsClient } from "@shared/aws.ts";

export function useDocDbService() {
  const rds = useAwsClient(RDSClient);

  return useMemo(() => createDocDbService(rds), [rds]);
}
