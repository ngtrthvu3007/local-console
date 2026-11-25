import { describe, expect, it } from "vitest";
import {
  ACTION_ALLOWED,
  awsManagedAlias,
  preferredRsaAlgorithm,
  contextOf,
  derToPem,
  isKeyMissing,
  keyLabel,
  keyOptions,
  keyTypeLabel,
  keyUsageLabel,
  parseBase64,
} from "../../../src/services/kms/keys.ts";
import { KEY_TABS, kmsRoutes } from "../../../src/services/kms/routes.ts";
import {
  aliasSchema,
  createKeySchema,
  KEY_PENDING,
  kmsKeyArnSchema,
  kmsKeyIdSchema,
  ciphertextSchema,
  scheduleDeletionSchema,
  tryItInputSchema,
} from "../../../src/services/kms/schemas.ts";

describe("kms", () => {
  it("opens a key by alias, alias ARN or key ARN", () => {
    expect(kmsRoutes.key("alias/a/b")).toBe("/kms/keys/detail?key=alias%2Fa%2Fb");
    expect(kmsRoutes.key("1234", KEY_TABS.tryIt)).toBe("/kms/keys/detail?key=1234&tab=try-it");
    expect(kmsRoutes.key("1234", KEY_TABS.details)).toBe("/kms/keys/detail?key=1234");
  });

  it("labels a key reference", () => {
    expect(keyLabel("arn:aws:kms:ap-southeast-1:000000000000:key/1234")).toBe("1234");
    expect(keyLabel("arn:aws:kms:ap-southeast-1:000000000000:alias/orders")).toBe("alias/orders");
    expect(keyLabel("alias/orders")).toBe("alias/orders");
  });

  it("locks actions by state", () => {
    expect(ACTION_ALLOWED.enable("Disabled")).toBe(true);
    expect(ACTION_ALLOWED.enable("Enabled")).toBe(false);
    expect(ACTION_ALLOWED.cancelDeletion("PendingDeletion")).toBe(true);
    expect(ACTION_ALLOWED.scheduleDeletion("PendingDeletion")).toBe(false);
    expect(ACTION_ALLOWED.disable("PendingDeletion")).toBe(false);
  });

  it("counts the 4096 limit in UTF-8 bytes", () => {
    expect(tryItInputSchema.safeParse("é".repeat(2048)).success).toBe(true);
    expect(tryItInputSchema.safeParse("é".repeat(2049)).success).toBe(false);
  });

  it("doesn't apply the plaintext limit to ciphertext (base64 of 4096 bytes is longer)", () => {
    expect(ciphertextSchema.safeParse("QUJD".repeat(2000) + "\n").success).toBe(true);
    expect(ciphertextSchema.safeParse("  ").success).toBe(false);
  });

  it("accepts pasted base64 with spaces and line breaks", () => {
    expect(new TextDecoder().decode(parseBase64("eGlu\n IGNo w6Bv"))).toBe("xin chào");
    expect(() => parseBase64("not base64!")).toThrow("Not valid base64.");
  });

  it("lists customer keys once each, aliased or not, never AWS managed", () => {
    const arn = (id: string) => `arn:aws:kms:ap-southeast-1:000000000000:key/${id}`;
    const options = keyOptions(
      [
        { KeyId: "k1", KeyArn: arn("k1") },
        { KeyId: "k2", KeyArn: arn("k2") },
        { KeyId: "aws1", KeyArn: arn("aws1") },
      ],
      [
        { AliasName: "alias/orders", TargetKeyId: "k1" },
        { AliasName: "alias/aws/sqs", TargetKeyId: "aws1" },
      ],
    );

    expect(options.map((option) => option.label)).toEqual(["alias/orders", "k2"]);
    expect(options[0].value).toBe("arn:aws:kms:ap-southeast-1:000000000000:key/k1");
  });

  it("validates aliases and the deletion window", () => {
    expect(aliasSchema(["alias/orders"]).safeParse({ name: "orders" }).success).toBe(false);
    expect(
      createKeySchema([]).safeParse({
        type: "symmetric",
        usage: "ENCRYPT_DECRYPT",
        spec: "SYMMETRIC_DEFAULT",
        alias: "aws/x",
        description: "",
      }).success,
    ).toBe(false);
    expect(scheduleDeletionSchema.safeParse({ days: 6 }).success).toBe(false);
    expect(scheduleDeletionSchema.safeParse({ days: 31 }).success).toBe(false);
    expect(scheduleDeletionSchema.safeParse({ days: 7 }).success).toBe(true);
  });

  it("adds alias/ to a new key's alias and checks the spec fits the type", () => {
    const hmac = { type: "hmac", usage: "GENERATE_VERIFY_MAC", description: "" } as const;
    expect(createKeySchema([]).parse({ ...hmac, spec: "HMAC_256", alias: "mac" }).alias).toBe(
      "alias/mac",
    );
    expect(createKeySchema([]).safeParse({ ...hmac, spec: "RSA_2048", alias: "" }).success).toBe(
      false,
    );
  });

  it("builds an encryption context from filled rows only", () => {
    expect(
      contextOf([
        { key: "app", value: "orders" },
        { key: " ", value: "x" },
      ]),
    ).toEqual({
      app: "orders",
    });
    expect(contextOf([])).toBeUndefined();
  });

  it("accepts the service default, a key ARN or an alias in key pickers", () => {
    expect(kmsKeyIdSchema.safeParse("").success).toBe(true);
    expect(kmsKeyIdSchema.safeParse("arn:aws:kms:ap-southeast-1:000000000000:key/k1").success).toBe(
      true,
    );
    // Parameter SSM tạo từ CLI lưu KeyId dạng alias: form Edit phải nhận lại được
    expect(kmsKeyIdSchema.safeParse("alias/orders").success).toBe(true);
    expect(kmsKeyIdSchema.safeParse("orders").success).toBe(false);
    // put-parameter --key-id <uuid> lưu key ID trơn: Edit phải lưu lại được
    expect(kmsKeyIdSchema.safeParse("1234abcd-12ab-34cd-56ef-1234567890ab").success).toBe(true);
  });

  it("blocks an alias another key already has when creating a key", () => {
    const form = {
      type: "symmetric",
      usage: "ENCRYPT_DECRYPT",
      spec: "SYMMETRIC_DEFAULT",
      description: "",
    } as const;
    expect(createKeySchema(["alias/orders"]).safeParse({ ...form, alias: "orders" }).success).toBe(
      false,
    );
    expect(createKeySchema(["alias/orders"]).safeParse({ ...form, alias: "" }).success).toBe(true);
  });

  it("prefers RSAES_OAEP_SHA_256 whatever order Floci returns", () => {
    expect(preferredRsaAlgorithm(["RSAES_OAEP_SHA_1", "RSAES_OAEP_SHA_256"])).toBe(
      "RSAES_OAEP_SHA_256",
    );
    expect(preferredRsaAlgorithm(["RSAES_OAEP_SHA_1"])).toBe("RSAES_OAEP_SHA_1");
    expect(preferredRsaAlgorithm([])).toBeUndefined();
  });

  it("builds the AWS managed alias of a service", () => {
    expect(awsManagedAlias("sqs")).toBe("alias/aws/sqs");
  });

  it("asks for a key once 'Enter a key' is picked, and Lambda takes ARNs only", () => {
    expect(kmsKeyIdSchema.safeParse(KEY_PENDING).success).toBe(false);
    expect(
      kmsKeyArnSchema.safeParse("arn:aws:kms:ap-southeast-1:000000000000:key/k1").success,
    ).toBe(true);
    expect(kmsKeyArnSchema.safeParse("alias/orders").success).toBe(false);
    expect(kmsKeyArnSchema.safeParse("").success).toBe(true);
  });

  it("wraps a DER public key as PEM", () => {
    expect(derToPem("QUJD")).toBe("-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----");
  });

  it("labels key type and usage like the AWS console", () => {
    expect(keyTypeLabel({ KeySpec: "SYMMETRIC_DEFAULT" })).toBe("Symmetric");
    expect(keyTypeLabel({ KeySpec: "ECC_NIST_P256" })).toBe("ECC_NIST_P256");
    expect(keyUsageLabel("GENERATE_VERIFY_MAC")).toBe("Generate and verify MAC");
    expect(keyUsageLabel(undefined)).toBe("—");
  });

  it("treats NotFoundException as a missing key", () => {
    expect(isKeyMissing({ name: "NotFoundException", $metadata: { httpStatusCode: 400 } })).toBe(
      true,
    );
    expect(isKeyMissing({ name: "DisabledException" })).toBe(false);
  });
});
