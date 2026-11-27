import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { useAwsClient } from "@shared/aws.ts";

export interface ApiGatewayClients {
  v1: APIGatewayClient;
  v2: ApiGatewayV2Client;
}

export const useApiGateway = (): ApiGatewayClients => ({
  v1: useAwsClient(APIGatewayClient),
  v2: useAwsClient(ApiGatewayV2Client),
});
