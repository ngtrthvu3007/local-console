import { useMemo } from "react";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { createApiGatewayService } from "@localconsole/core/apigateway";
import { useAwsClient } from "@shared/aws.ts";

export function useApiGatewayService() {
  const v1 = useAwsClient(APIGatewayClient);
  const v2 = useAwsClient(ApiGatewayV2Client);

  return useMemo(() => createApiGatewayService(v1, { v2 }), [v1, v2]);
}
