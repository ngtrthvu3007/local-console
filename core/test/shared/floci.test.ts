import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FLOCI_ENDPOINTS, flociUrl } from "#shared/floci/endpoints.ts";
import { createFlociService } from "#shared/floci/service.ts";

describe("flociUrl", () => {
  it("joins base, path and non-empty query values", () => {
    expect(
      flociUrl("http://localhost:3701/aws", FLOCI_ENDPOINTS.sesMailbox, {
        email: "a@x.com",
        id: undefined,
      }),
    ).toBe("http://localhost:3701/aws/_aws/ses?email=a%40x.com");
  });

  it("keeps a single slash when the base ends with one", () => {
    expect(flociUrl("http://floci:4566/", FLOCI_ENDPOINTS.health)).toBe(
      "http://floci:4566/_floci/health",
    );
  });
});

// Floci giả: trả manifest, health, ghi lại request reset
let floci: http.Server;
let baseUrl: string;
const requests: string[] = [];

beforeAll(async () => {
  floci = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("content-type", "application/json");
    if (request.url === FLOCI_ENDPOINTS.info)
      return response.end(JSON.stringify({ version: "2.4.0", edition: "community" }));
    if (request.url === FLOCI_ENDPOINTS.health)
      return response.end(JSON.stringify({ services: { sqs: "running", ses: "available" } }));
    if (request.url === FLOCI_ENDPOINTS.reset)
      return response.end(JSON.stringify({ status: "OK" }));
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "nope" }));
  });
  await new Promise<void>((resolve) => floci.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(floci.address() as AddressInfo).port}`;
});
afterAll(() => floci.close());

describe("createFlociService", () => {
  it("merges the manifest with the service states from health", async () => {
    await expect(createFlociService(baseUrl).getInfo()).resolves.toEqual({
      version: "2.4.0",
      edition: "community",
      services: { sqs: "running", ses: "available" },
    });
  });

  it("resets data with a POST", async () => {
    await createFlociService(baseUrl).resetData();
    expect(requests).toContain(`POST ${FLOCI_ENDPOINTS.reset}`);
  });
});
