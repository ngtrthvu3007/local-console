import { describe, expect, it } from "vitest";
import { grantIfChanged } from "../../../src/services/apigateway/grants.ts";

const values = { grant: true, functionArn: "fn-a" };

describe("grantIfChanged", () => {
  it("grants a function that isn't attached yet", () => {
    expect(grantIfChanged(values, "fn-b").grant).toBe(true);
  });

  it("skips the function already attached", () => {
    expect(grantIfChanged(values, "fn-a").grant).toBe(false);
  });

  // SourceArn của route chứa route key: đổi key thì quyền cũ không khớp nữa
  it("grants again when the route key changes", () => {
    expect(grantIfChanged(values, "fn-a", false).grant).toBe(true);
  });

  it("never grants when the box is off", () => {
    expect(grantIfChanged({ ...values, grant: false }, "fn-b", false).grant).toBe(false);
  });
});
