import { matchPath } from "react-router";
import { describe, expect, it } from "vitest";
import { cloudformationRoutes } from "@localconsole/core/cloudformation";

// Đường dẫn của core phải khớp pattern của react-router
describe("stack routes", () => {
  it("a stack named create still opens its own page", () => {
    const stackPattern = "/cloudformation/stacks/:stack";

    expect(matchPath(stackPattern, cloudformationRoutes.stack("create"))?.params.stack).toBe(
      "create",
    );

    expect(matchPath(stackPattern, cloudformationRoutes.createStack)).toBeNull();
  });

  it("the create page stays under Stacks, so the sidebar keeps CloudFormation selected", () => {
    expect(cloudformationRoutes.createStack.startsWith(`${cloudformationRoutes.stacks}/`)).toBe(
      true,
    );

    expect(
      matchPath("/cloudformation/stacks/:stack/edit", cloudformationRoutes.createStack),
    ).toBeNull();
  });
});
