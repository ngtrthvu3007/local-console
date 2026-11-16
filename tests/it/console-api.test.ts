import { describe, expect, it } from "vitest";
import { CONSOLE_URL, consoleApi, consoleConfig } from "./helpers.ts";

describe("console API", () => {
  it("reports Floci as reachable on /api/health", async () => {
    const { status, body } = await consoleApi("GET", "/api/health");
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok" });
    expect(body.endpoint).toMatch(/^https?:\/\//);
  });

  it("gives the web app its region and Floci URLs", async () => {
    const config = await consoleConfig();
    expect(config.region).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
    expect(config.flociPublicUrl).toMatch(/^https?:\/\//);
    expect(config.flociInternalUrl).toMatch(/^https?:\/\//);
  });

  it("answers an unknown /api route with a 404 JSON error", async () => {
    const { status, body } = await consoleApi("GET", "/api/does-not-exist");
    expect(status).toBe(404);
    expect(body).toEqual({ code: "NotFound", message: "Unknown API route" });
  });

  it("forwards /aws/* to Floci unchanged", async () => {
    // _floci/health là endpoint của chính Floci, chỉ tới được nếu proxy bỏ đúng tiền tố /aws
    const response = await fetch(`${CONSOLE_URL}/aws/_floci/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("services");
  });

  it("serves the web app for deep links (SPA fallback)", async () => {
    const response = await fetch(`${CONSOLE_URL}/dynamodb/tables`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });
});
