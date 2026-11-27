import { describe, expect, it, vi } from "vitest";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { API_TYPES } from "#services/apigateway/apis.ts";
import type { ApiValues } from "#services/apigateway/schemas.ts";
import { createApiGatewayService } from "#services/apigateway/service.ts";

const REGION = "us-east-1";
const FUNCTION_ARN = `arn:aws:lambda:${REGION}:000000000000:function:f`;

// Client thật, chỉ thay send
function service(lambdaSend: () => Promise<unknown>) {
  const v1 = new APIGatewayClient({ region: REGION });
  const v2 = new ApiGatewayV2Client({ region: REGION });
  const lambda = new LambdaClient({ region: REGION });
  vi.spyOn(v2, "send").mockImplementation((() => Promise.resolve({ ApiId: "h1" })) as never);
  const lambdaSpy = vi.spyOn(lambda, "send").mockImplementation(lambdaSend as never);
  return { apigateway: createApiGatewayService(v1, { v2, lambda, region: REGION }), lambdaSpy };
}

const HTTP_API: ApiValues = {
  type: API_TYPES.http,
  name: "orders",
  description: "",
  functionArn: FUNCTION_ARN,
  grant: true,
  routeSelection: "",
};

describe("createApi", () => {
  it("reports a failed grant without failing", async () => {
    const { apigateway } = service(() => Promise.reject(new Error("Function not found")));
    await expect(apigateway.createApi(HTTP_API)).resolves.toEqual({
      api: { version: "v2", apiId: "h1" },
      failures: ["Couldn't grant permission: Function not found"],
    });
  });

  it("grants the $default route of a quick-created HTTP API", async () => {
    const { apigateway, lambdaSpy } = service(() => Promise.resolve({}));
    await expect(apigateway.createApi(HTTP_API)).resolves.toMatchObject({ failures: [] });
    expect(lambdaSpy.mock.calls[0][0].input).toMatchObject({
      FunctionName: FUNCTION_ARN,
      SourceArn: `arn:aws:execute-api:${REGION}:000000000000:h1/*/$default`,
    });
  });

  it("skips the grant when the box is off", async () => {
    const { apigateway, lambdaSpy } = service(() => Promise.resolve({}));
    await apigateway.createApi({ ...HTTP_API, grant: false });
    expect(lambdaSpy).not.toHaveBeenCalled();
  });
});
