import { describe, expect, it } from "vitest";
import { environmentSchema } from "#services/lambda/schemas.ts";

describe("environmentSchema encryption key", () => {
  it("takes the default key or a KMS key ARN", () => {
    const arn = "arn:aws:kms:ap-southeast-1:000000000000:key/k1";
    expect(environmentSchema.parse({ entries: [], kmsKeyArn: arn }).kmsKeyArn).toBe(arn);
    expect(environmentSchema.safeParse({ entries: [], kmsKeyArn: "k1" }).success).toBe(false);
  });
});
