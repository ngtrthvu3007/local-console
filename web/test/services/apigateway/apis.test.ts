import { describe, expect, it, vi } from "vitest";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { API_FAMILIES, listApis } from "../../../src/services/apigateway/apis.ts";

// Client thật, chỉ thay send: paginateGetRestApis kiểm instanceof
function clients(restSend: () => Promise<unknown>, v2Send: () => Promise<unknown>) {
  const v1 = new APIGatewayClient({ region: "us-east-1" });
  const v2 = new ApiGatewayV2Client({ region: "us-east-1" });
  vi.spyOn(v1, "send").mockImplementation(restSend as never);
  vi.spyOn(v2, "send").mockImplementation(v2Send as never);
  return { v1, v2 };
}
const restOk = () => Promise.resolve({ items: [{ id: "r1", name: "a" }] });
const fail = (message: string) => () => Promise.reject(new Error(message));

describe("listApis", () => {
  it("keeps REST rows and exposes the error when v2 fails", async () => {
    const { v1, v2 } = clients(restOk, fail("boom"));
    const { rows, failures } = await listApis(v1, v2);
    expect(rows.map((row) => row.id)).toEqual(["r1"]);
    expect(failures.map((failure) => failure.family)).toEqual([API_FAMILIES.v2]);
  });

  it("rejects when both sides fail", async () => {
    const { v1, v2 } = clients(fail("x"), fail("y"));
    await expect(listApis(v1, v2)).rejects.toThrow("x");
  });
});
