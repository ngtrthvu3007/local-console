import { describe, expect, it } from "vitest";
import { chunks } from "../../../src/shared/aws.ts";
import { ssmRoutes } from "../../../src/services/ssm/routes.ts";
import { parameterSchema } from "../../../src/services/ssm/schemas.ts";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("parameter routes", () => {
  it("puts the parameter name in the query string", () => {
    expect(ssmRoutes.parameter("/app/dev/db-host")).toBe(
      "/ssm/parameters/detail?name=%2Fapp%2Fdev%2Fdb-host",
    );
    expect(ssmRoutes.editParameter("db-host")).toBe("/ssm/parameters/edit?name=db-host");
  });
});

describe("parameterSchema", () => {
  const check = (name: string, editing = false) =>
    parameterSchema(editing).safeParse({
      name,
      description: "",
      type: "String",
      value: "v",
      keyId: "",
    });

  it("keeps the KMS key of a SecureString, alias included", () => {
    const base = { name: "pw", description: "", type: "SecureString", value: "v" };
    expect(parameterSchema(true).parse({ ...base, keyId: "alias/aws/ssm" }).keyId).toBe(
      "alias/aws/ssm",
    );
    expect(parameterSchema(false).safeParse({ ...base, keyId: "k1" }).success).toBe(false);
  });

  it("accepts plain and path names", () => {
    expect(check("db-host").success).toBe(true);
    expect(check("/app/dev/db_host.v1").success).toBe(true);
  });

  it("rejects a path that doesn't start with /, other characters and empty names", () => {
    expect(firstMessage(check("app/dev"))).toBe("A name with / must start with /.");
    expect(check("a b").success).toBe(false);
    expect(firstMessage(check(""))).toBe("Enter a parameter name.");
  });

  it("doesn't check the locked name when editing", () => {
    expect(check("", true).success).toBe(true);
  });

  it("needs a value", () => {
    expect(
      firstMessage(
        parameterSchema(false).safeParse({ name: "n", description: "", type: "String", value: "" }),
      ),
    ).toBe("Enter a value.");
  });
});

describe("chunks", () => {
  it("splits into batches", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 10)).toEqual([]);
  });
});
