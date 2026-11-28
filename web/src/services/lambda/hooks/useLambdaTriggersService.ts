import { useMemo } from "react";
import { createLambdaTriggersService } from "@localconsole/core/lambda";
import { useApiGatewayService } from "../../apigateway/hooks/useApiGatewayService.ts";
import { useCognitoService } from "../../cognito/hooks/useCognitoService.ts";
import { useEventBridgeService } from "../../eventbridge/hooks/useEventBridgeService.ts";
import { useS3Service } from "../../s3/hooks/useS3Service.ts";
import { useSecretsService } from "../../secretsmanager/hooks/useSecretsService.ts";
import { useSnsService } from "../../sns/hooks/useSnsService.ts";
import { useLambdaService } from "./useLambdaService.ts";

export function useLambdaTriggersService() {
  const lambda = useLambdaService();
  const s3 = useS3Service();
  const sns = useSnsService();
  const eventbridge = useEventBridgeService();
  const cognito = useCognitoService();
  const apigateway = useApiGatewayService();
  const secrets = useSecretsService();

  return useMemo(
    () =>
      createLambdaTriggersService({ lambda, s3, sns, eventbridge, cognito, apigateway, secrets }),
    [lambda, s3, sns, eventbridge, cognito, apigateway, secrets],
  );
}
