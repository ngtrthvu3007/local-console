import { describe, expect, it } from "vitest";
import { joinRoutes } from "../../../src/services/apigateway/routeRows.ts";

describe("joinRoutes", () => {
  it("joins by Target integrations/<id>", () => {
    const rows = joinRoutes(
      [
        { RouteKey: "GET /a", Target: "integrations/i1" },
        { RouteKey: "$default" },
      ],
      [{ IntegrationId: "i1", IntegrationType: "HTTP_PROXY", IntegrationUri: "https://x" }],
    );
    expect(rows[0]).toMatchObject({ key: "GET /a", integrationUri: "https://x" });
    expect(rows[1].integrationType).toBeUndefined();
  });
});
