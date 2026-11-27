import { describe, expect, it } from "vitest";
import { generatePath } from "react-router";
import { fillPath } from "@localconsole/core/shared";

// Ký tự react-router mã hóa khác encodeURIComponent, cộng tên thường và tiếng Việt
const NAMES = ["orders", "a b", "a/b", "tên-việt", "$&+,:;=@", "100%", "q?x#y"];
const PATTERN = "/sqs/queues/:queue";

// Link của core (MCP dùng) phải trùng link UI dựng bằng react-router
describe("fillPath", () => {
  it("builds the same path as react-router for every name", () => {
    for (const name of NAMES)
      expect(fillPath(PATTERN, { queue: name })).toBe(generatePath(PATTERN, { queue: name }));
  });

  it("fills several params", () => {
    const pattern = "/apigateway/apis/:api/stages/:stage";
    const params = { api: "a b", stage: "prod" };
    expect(fillPath(pattern, params)).toBe(generatePath(pattern, params));
  });
});
