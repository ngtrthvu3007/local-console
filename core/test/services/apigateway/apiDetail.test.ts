import { describe, expect, it, vi } from "vitest";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { listAuthorizers, listStages } from "#services/apigateway/operations/apiDetail.ts";

// Trang 1 trả token, trang 2 thì không: hàm phải đọc đủ cả hai
function pagedClients(firstPage: unknown, lastPage: unknown) {
  const v1 = new APIGatewayClient({ region: "us-east-1" });
  const v2 = new ApiGatewayV2Client({ region: "us-east-1" });
  const pages = () => {
    let calls = 0;
    return (() => Promise.resolve(calls++ === 0 ? firstPage : lastPage)) as never;
  };
  vi.spyOn(v1, "send").mockImplementation(pages());
  vi.spyOn(v2, "send").mockImplementation(pages());
  return { v1, v2 };
}

describe("API detail paging", () => {
  it("reads every page of REST authorizers", async () => {
    const { v1, v2 } = pagedClients(
      { items: [{ id: "au1", name: "cognito-auth" }], position: "p2" },
      { items: [{ id: "au2", name: "token-auth" }] },
    );

    const rows = await listAuthorizers(v1, v2, { version: "v1", apiId: "a1" });

    expect(rows.map((row) => row.name)).toEqual(["cognito-auth", "token-auth"]);
  });

  it("reads every page of HTTP authorizers", async () => {
    const { v1, v2 } = pagedClients(
      { Items: [{ AuthorizerId: "au1", Name: "jwt-auth" }], NextToken: "t2" },
      { Items: [{ AuthorizerId: "au2", Name: "lambda-auth" }] },
    );

    const rows = await listAuthorizers(v1, v2, { version: "v2", apiId: "k9" });

    expect(rows.map((row) => row.name)).toEqual(["jwt-auth", "lambda-auth"]);
  });

  it("reads every page of HTTP stages", async () => {
    const { v1, v2 } = pagedClients(
      { Items: [{ StageName: "$default", DeploymentId: "d1" }], NextToken: "t2" },
      { Items: [{ StageName: "prod" }] },
    );

    const rows = await listStages(v1, v2, { version: "v2", apiId: "k9" });

    expect(rows).toEqual([
      { name: "$default", deploymentId: "d1", updated: undefined },
      { name: "prod", deploymentId: undefined, updated: undefined },
    ]);
  });
});
