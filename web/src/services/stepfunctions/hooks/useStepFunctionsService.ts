import { useMemo } from "react";
import { SFNClient } from "@aws-sdk/client-sfn";
import { createStepFunctionsService } from "@localconsole/core/stepfunctions";
import { useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useStepFunctionsService() {
  const sfn = useAwsClient(SFNClient);
  const { region } = useLoadedConfig();

  return useMemo(() => createStepFunctionsService(sfn, { region }), [sfn, region]);
}
