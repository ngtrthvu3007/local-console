import { describe, expect, it } from "vitest";
import { ruleSchema, scheduleSchema } from "#services/eventbridge/schemas.ts";

// Tên sai không được giấu lỗi của các trường khác: người dùng thấy hết một lượt, không phải sửa từng lỗi
const paths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => String(issue.path[0]));

describe("name errors come with the other errors", () => {
  it("rule: bad name and bad pattern", () => {
    const result = ruleSchema.safeParse({
      bus: "default",
      name: "bad name",
      description: "",
      type: "pattern",
      eventPattern: "{oops",
      scheduleExpression: "",
      enabled: true,
    });
    expect(paths(result)).toEqual(expect.arrayContaining(["name", "eventPattern"]));
  });

  it("schedule: bad name and missing target", () => {
    const result = scheduleSchema(new Set()).safeParse({
      name: "bad name",
      group: "default",
      description: "",
      kind: "rate",
      atTime: "",
      rateValue: "5",
      rateUnit: "minutes",
      cron: "",
      timezone: "UTC",
      deleteAfter: true,
      flexMode: "OFF",
      flexMinutes: "5",
      targetKind: "lambda",
      targetArn: "",
      groupId: "",
      source: "",
      detailType: "",
      input: "",
      enabled: true,
    });
    expect(paths(result)).toEqual(expect.arrayContaining(["name", "targetArn"]));
  });
});
