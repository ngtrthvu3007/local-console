import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cloudscapeDir = dirname(require.resolve("@cloudscape-design/components/package.json"));
const tokens = readFileSync(join(cloudscapeDir, "internal/generated/styles/tokens.js"), "utf8");
const layoutCss = readFileSync(new URL("../../src/shared/Layout.css", import.meta.url), "utf8");

// Layout.css đặt thẳng biến CSS của token nút; tên có hash đổi theo bản Cloudscape
describe("button tokens in Layout.css", () => {
  it.each([
    "borderRadiusButton",
    "borderWidthButton",
    "spaceButtonVertical",
    "spaceButtonHorizontal",
  ])("%s still uses the variable name Layout.css overrides", (token) => {
    const name = new RegExp(`export var ${token} = "var\\((--[a-z0-9-]+),`).exec(tokens)?.[1];

    expect(name).toBeDefined();
    expect(layoutCss).toContain(`${name}:`);
  });
});
