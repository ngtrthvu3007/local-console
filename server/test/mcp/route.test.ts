import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.ts";
import { loadConfig } from "../../src/config.ts";
import { FLOCI_DOWN_MESSAGE } from "../../src/mcp/result.ts";

// Floci giả: chỉ có hai endpoint mà floci_read_status đọc
const FLOCI_ANSWERS: Record<string, unknown> = {
  "/_floci/info": { version: "2.4.0" },
  "/_floci/health": { services: { sqs: "running" } },
};
// Client theo spec 2025 (chưa có envelope của 2026-07-28): SDK phục vụ bằng nhánh stateless
const PROTOCOL_VERSION = "2025-06-18";

let fakeFloci: http.Server;
let flociUrl: string;

beforeAll(async () => {
  fakeFloci = http.createServer((incoming, outgoing) => {
    outgoing.setHeader("content-type", "application/json");
    outgoing.end(JSON.stringify(FLOCI_ANSWERS[incoming.url ?? ""] ?? {}));
  });
  await new Promise<void>((resolve) => fakeFloci.listen(0, "127.0.0.1", resolve));
  flociUrl = `http://127.0.0.1:${(fakeFloci.address() as AddressInfo).port}`;
});
afterAll(() => fakeFloci.close());

const appFor = (endpoint = flociUrl) => createApp(loadConfig({ AWS_ENDPOINT_URL: endpoint }));

// Kết quả JSON-RPC nằm trong dòng "data:" của SSE (hoặc là cả body khi SDK trả JSON)
const rpcBody = (response: request.Response) => {
  const data = response.text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(data ? data.slice("data: ".length) : response.text);
};

function rpc(method: string, params: object, { query = "", app = appFor(), host = "" } = {}) {
  const call = request(app)
    .post(`/mcp${query}`)
    .set("accept", "application/json, text/event-stream")
    .set("mcp-protocol-version", PROTOCOL_VERSION)
    .send({ jsonrpc: "2.0", id: 1, method, params });

  return host ? call.set("host", host) : call;
}

describe("POST /mcp", () => {
  it("answers initialize with the server name", async () => {
    const response = await rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(response.status).toBe(200);
    expect(rpcBody(response).result.serverInfo.name).toBe("local-console");
  });

  it("lists only the tools of the groups in ?services=", async () => {
    const response = await rpc("tools/list", {}, { query: "?services=floci" });
    const names = rpcBody(response).result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(["floci_read_status"]);
  });

  it("rejects an unknown group with a JSON-RPC error naming the valid ones", async () => {
    const response = await rpc("tools/list", {}, { query: "?services=nope" });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/nope.*floci, reset, sqs, ses/);
  });

  it("blocks a request sent by another site (localOnly)", async () => {
    const response = await rpc("tools/list", {}).set("sec-fetch-site", "cross-site");
    expect(response.status).toBe(403);
  });

  it("builds consoleUrl from the Host of the request", async () => {
    const response = await rpc(
      "tools/call",
      { name: "floci_read_status", arguments: {} },
      { host: "127.0.0.1:4000" },
    );
    const { structuredContent } = rpcBody(response).result;
    expect(structuredContent).toMatchObject({ version: "2.4.0", services: { sqs: "running" } });
    expect(structuredContent.consoleUrl).toBe("http://127.0.0.1:4000/");
  });

  it("tells how to start Floci when it doesn't answer", async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));

    const response = await rpc(
      "tools/call",
      { name: "floci_read_status", arguments: {} },
      { app: appFor(`http://127.0.0.1:${port}`) },
    );
    const { result } = rpcBody(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(FLOCI_DOWN_MESSAGE);
  });

  it("returns the form message when the input is invalid", async () => {
    const response = await rpc("tools/call", {
      name: "sqs_create_queue",
      arguments: { name: "" },
    });
    const { result } = rpcBody(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Enter a queue name.");
  });
});
