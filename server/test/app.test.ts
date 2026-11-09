import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

// Floci giả: trả 200 cho /_floci/health, path khác thì echo method + path
let fakeFloci: http.Server;
let flociUrl: string;

beforeAll(async () => {
  fakeFloci = http.createServer((incomingRequest, outgoingResponse) => {
    if (incomingRequest.url === "/_floci/health")
      return outgoingResponse.end('{"status":"running"}');
    outgoingResponse.setHeader("content-type", "application/json");
    outgoingResponse.end(
      JSON.stringify({ method: incomingRequest.method, url: incomingRequest.url }),
    );
  });
  await new Promise<void>((resolve) => fakeFloci.listen(0, "127.0.0.1", resolve));
  flociUrl = `http://127.0.0.1:${(fakeFloci.address() as AddressInfo).port}`;
});
afterAll(() => fakeFloci.close());

const appFor = (endpoint: string) => createApp(loadConfig({ AWS_ENDPOINT_URL: endpoint }));

describe("GET /api/health", () => {
  it("is ok when Floci answers", async () => {
    const response = await request(appFor(flociUrl)).get("/api/health");
    expect(response.body).toEqual({ status: "ok", endpoint: flociUrl });
  });

  // Cổng vừa mở rồi đóng: chắc chắn không ai nghe (cổng 1 bị fetch chặn: "bad port")
  const closedPort = async () => {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));
    return port;
  };

  it("is unavailable with a reason when Floci does not answer", async () => {
    const response = await request(appFor(`http://127.0.0.1:${await closedPort()}`)).get(
      "/api/health",
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "unavailable",
      error: expect.stringMatching(/ECONNREFUSED/),
    });
  });

  it("keeps a reason when localhost resolves to IPv4 and IPv6 (AggregateError without message)", async () => {
    const response = await request(appFor(`http://localhost:${await closedPort()}`)).get(
      "/api/health",
    );
    expect(response.body).toMatchObject({
      status: "unavailable",
      error: expect.stringMatching(/ECONNREFUSED/),
    });
  });
});

describe("/aws proxy", () => {
  it("strips /aws and forwards the request to Floci unchanged", async () => {
    const response = await request(appFor(flociUrl)).put("/aws/my-bucket/a.txt?x=1").send("hello");
    expect(response.body).toEqual({ method: "PUT", url: "/my-bucket/a.txt?x=1" });
  });
});

describe("API", () => {
  it("returns the config for the web app", async () => {
    const response = await request(appFor(flociUrl)).get("/api/config");
    expect(response.body).toEqual({
      region: "ap-southeast-1",
      flociPublicUrl: "http://localhost:4566",
      flociInternalUrl: flociUrl,
    });
  });

  it("answers unknown /api routes with a 404 JSON", async () => {
    const response = await request(appFor(flociUrl)).get("/api/nope");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NotFound");
  });
});

describe("loadConfig", () => {
  it("defaults to port 3701", () => {
    expect(loadConfig({}).PORT).toBe(3701);
  });

  it("reports invalid variables clearly", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ AWS_ENDPOINT_URL: "not-a-url" })).toThrow(/AWS_ENDPOINT_URL/);
  });
});
