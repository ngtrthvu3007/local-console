import { describe, expect, it, vi } from "vitest";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { API_TYPES } from "#services/apigateway/apis.ts";
import { createRoute, deleteRoute, updateRoute } from "#services/apigateway/operations/routes.ts";
import type { RouteValues } from "#services/apigateway/schemas.ts";

const OLD_ARN = "arn:aws:lambda:us-east-1:000000000000:function:old";
const NEW_ARN = "arn:aws:lambda:us-east-1:000000000000:function:new";
const ROUTE = { RouteId: "r1", RouteKey: "GET /a", Target: "integrations/i1" };
const SHARING = { RouteId: "r2", RouteKey: "GET /b", Target: "integrations/i1" };
const INVOCATION_URI = `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${OLD_ARN}/invocations`;
const LAMBDA_INTEGRATION = { IntegrationType: "AWS_PROXY", IntegrationUri: OLD_ARN };

// Client thật, send trả theo tên lệnh; ghi lại lệnh đã gửi để kiểm cách đổi đích
function client(routesAfter: object[], integration: object = LAMBDA_INTEGRATION, failing?: string) {
  const v2 = new ApiGatewayV2Client({ region: "us-east-1" });
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const replies: Record<string, object> = {
    GetRouteCommand: ROUTE,
    GetRoutesCommand: { Items: routesAfter },
    GetIntegrationCommand: { IntegrationId: "i1", ...integration },
    CreateIntegrationCommand: { IntegrationId: "i2" },
  };
  vi.spyOn(v2, "send").mockImplementation(((command: {
    constructor: { name: string };
    input: Record<string, unknown>;
  }) => {
    sent.push({ name: command.constructor.name, input: command.input });
    if (command.constructor.name === failing) return Promise.reject(new Error("boom"));
    return Promise.resolve(replies[command.constructor.name] ?? {});
  }) as never);
  return { v2, names: () => sent.map(({ name }) => name), sent };
}

const values = (functionArn: string): RouteValues => ({
  routeKey: "GET /a",
  integration: "lambda",
  functionArn,
  grant: false,
  url: "",
  authorization: "NONE",
  twoWay: false,
});
const NO_AUTH = { authorizationType: "NONE" };

describe("updateRoute", () => {
  it("edits the integration in place when only this route uses it", async () => {
    const { v2, names } = client([ROUTE]);
    await updateRoute(v2, "a1", API_TYPES.http, "r1", values(NEW_ARN), NO_AUTH);
    expect(names()).toContain("UpdateIntegrationCommand");
    expect(names()).not.toContain("CreateIntegrationCommand");
  });

  it("gives the route a new integration when another route shares it", async () => {
    const { v2, names, sent } = client([ROUTE, SHARING]);
    await updateRoute(v2, "a1", API_TYPES.http, "r1", values(NEW_ARN), NO_AUTH);
    expect(names()).toContain("CreateIntegrationCommand");
    expect(names()).not.toContain("UpdateIntegrationCommand");
    expect(sent.find(({ name }) => name === "UpdateRouteCommand")?.input.Target).toBe(
      "integrations/i2",
    );
  });

  it("leaves a shared integration alone when the target doesn't change", async () => {
    const { v2, names } = client([ROUTE, SHARING]);
    await updateRoute(v2, "a1", API_TYPES.http, "r1", values(OLD_ARN), NO_AUTH);
    expect(names()).not.toContain("CreateIntegrationCommand");
    expect(names()).not.toContain("UpdateIntegrationCommand");
  });

  // Terraform / CDK WebSocket dùng URI invocation: vẫn là cùng function
  it("leaves an integration that points at the same function through an invocation URI", async () => {
    const { v2, names } = client([ROUTE], {
      IntegrationType: "AWS_PROXY",
      IntegrationUri: INVOCATION_URI,
      PayloadFormatVersion: "1.0",
    });
    await updateRoute(v2, "a1", API_TYPES.http, "r1", values(OLD_ARN), NO_AUTH);
    expect(names()).not.toContain("UpdateIntegrationCommand");
    expect(names()).not.toContain("CreateIntegrationCommand");
  });

  it("keeps the payload format of an integration it edits in place", async () => {
    const { v2, sent } = client([ROUTE], { ...LAMBDA_INTEGRATION, PayloadFormatVersion: "1.0" });
    await updateRoute(v2, "a1", API_TYPES.http, "r1", values(NEW_ARN), NO_AUTH);
    const update = sent.find(({ name }) => name === "UpdateIntegrationCommand")?.input;
    expect(update).toMatchObject({ IntegrationUri: NEW_ARN });
    expect(update).not.toHaveProperty("PayloadFormatVersion");
  });
});

describe("createRoute", () => {
  it("deletes the integration it made when the route can't be created", async () => {
    const { v2, names } = client([], LAMBDA_INTEGRATION, "CreateRouteCommand");
    await expect(createRoute(v2, "a1", API_TYPES.http, values(NEW_ARN), NO_AUTH)).rejects.toThrow(
      "boom",
    );
    expect(names()).toContain("DeleteIntegrationCommand");
  });
});

describe("deleteRoute", () => {
  it("deletes an integration no route uses any more", async () => {
    const { v2, names } = client([]);
    await deleteRoute(v2, "a1", "r1");
    expect(names()).toEqual(
      expect.arrayContaining(["DeleteRouteCommand", "DeleteIntegrationCommand"]),
    );
  });

  it("keeps an integration another route still uses", async () => {
    const { v2, names } = client([SHARING]);
    await deleteRoute(v2, "a1", "r1");
    expect(names()).toContain("DeleteRouteCommand");
    expect(names()).not.toContain("DeleteIntegrationCommand");
  });
});
