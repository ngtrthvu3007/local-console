import { describe, expect, it } from "vitest";
import { createTableSchema } from "#services/dynamodb/schemas.ts";

describe("createTableSchema encryption", () => {
  const base = {
    name: "orders",
    partitionKey: { name: "pk", type: "S" },
    sortKey: { name: "", type: "S" },
    indexes: [],
  };

  it("defaults to an AWS owned key and takes a KMS key ARN for a customer key", () => {
    expect(
      createTableSchema.parse({ ...base, encryption: "aws-owned", kmsKeyId: "" }).encryption,
    ).toBe("aws-owned");
    expect(
      createTableSchema.safeParse({ ...base, encryption: "customer", kmsKeyId: "k1" }).success,
    ).toBe(false);
  });

  it("needs a key when a customer managed key is chosen", () => {
    expect(
      createTableSchema.safeParse({ ...base, encryption: "customer", kmsKeyId: "" }).success,
    ).toBe(false);
  });
});
