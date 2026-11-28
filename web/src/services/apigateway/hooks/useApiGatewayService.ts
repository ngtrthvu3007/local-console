import { useMemo } from "react";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { createApiGatewayService } from "@localconsole/core/apigateway";
import { useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useApiGatewayService() {
  const v1 = useAwsClient(APIGatewayClient);
  const v2 = useAwsClient(ApiGatewayV2Client);
  const lambda = useAwsClient(LambdaClient);
  const { region } = useLoadedConfig();

  return useMemo(
    () => createApiGatewayService(v1, { v2, lambda, region }),
    [v1, v2, lambda, region],
  );
}
