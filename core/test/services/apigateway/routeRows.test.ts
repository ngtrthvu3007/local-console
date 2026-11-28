import { describe, expect, it } from "vitest";
import { joinRoutes } from "#services/apigateway/routeRows.ts";

describe("joinRoutes", () => {
  it("joins by Target integrations/<id>", () => {
    const rows = joinRoutes(
      [{ RouteKey: "GET /a", Target: "integrations/i1" }, { RouteKey: "$default" }],
      [{ IntegrationId: "i1", IntegrationType: "HTTP_PROXY", IntegrationUri: "https://x" }],
    );
    expect(rows[0]).toMatchObject({ key: "GET /a", integrationUri: "https://x" });
    expect(rows[1].integrationType).toBeUndefined();
  });

  it("keeps the ids the console edits by and whether the route replies", () => {
    const [row] = joinRoutes(
      [
        {
          RouteId: "r1",
          RouteKey: "$default",
          Target: "integrations/i1",
          RouteResponseSelectionExpression: "$default",
        },
      ],
      [{ IntegrationId: "i1" }],
    );
    expect(row).toMatchObject({ id: "r1", integrationId: "i1", twoWay: true });
  });
});
