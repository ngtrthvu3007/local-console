import {
  CreateDeploymentCommand,
  DeleteStageCommand,
  type APIGatewayClient,
} from "@aws-sdk/client-api-gateway";
import {
  CreateStageCommand,
  DeleteStageCommand as DeleteStageV2Command,
  type ApiGatewayV2Client,
} from "@aws-sdk/client-apigatewayv2";
import { API_VERSIONS } from "#services/apigateway/paths.ts";
import type { ApiRef } from "./apis.ts";

export async function createStage(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
  name: string,
  autoDeploy: boolean,
) {
  if (version === API_VERSIONS.rest) {
    // Stage REST cần một deployment ("Deploy to new stage" của AWS console)
    await v1.send(new CreateDeploymentCommand({ restApiId: apiId, stageName: name }));
    return;
  }
  await v2.send(new CreateStageCommand({ ApiId: apiId, StageName: name, AutoDeploy: autoDeploy }));
}

export async function deleteStage(
  v1: APIGatewayClient,
  v2: ApiGatewayV2Client,
  { version, apiId }: ApiRef,
  name: string,
) {
  if (version === API_VERSIONS.rest) {
    await v1.send(new DeleteStageCommand({ restApiId: apiId, stageName: name }));
    return;
  }
  await v2.send(new DeleteStageV2Command({ ApiId: apiId, StageName: name }));
}
