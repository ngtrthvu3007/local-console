import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CancelKeyDeletionCommand,
  CreateKeyCommand,
  DecryptCommand,
  GenerateMacCommand,
  SignCommand,
  VerifyCommand,
  VerifyMacCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  EncryptCommand,
  KMSClient,
  ListKeysCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { strToU8, zipSync } from "fflate";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Hành vi KMS của Floci mà trang KMS dựa vào, qua proxy /aws của console (spec KMS mục 7)

const PLAINTEXT = new TextEncoder().encode("xin chào");
const MISSING_KEY = "00000000-0000-0000-0000-000000000000";
const MIN_PENDING_DAYS = 7;

let kms: KMSClient;
let keyId = "";
const created: string[] = [];

const stateOf = async (id: string) =>
  (await kms.send(new DescribeKeyCommand({ KeyId: id }))).KeyMetadata?.KeyState;

beforeAll(async () => {
  kms = new KMSClient(viaConsole((await consoleConfig()).region));
  const { KeyMetadata } = await kms.send(new CreateKeyCommand({ Description: uniqueName("kms") }));
  keyId = KeyMetadata?.KeyId ?? "";
  created.push(keyId);
});

// Floci không xóa key ngay: lên lịch xóa (tối thiểu 7 ngày) là cách dọn duy nhất
afterAll(async () => {
  for (const id of created) {
    await kms
      .send(new ScheduleKeyDeletionCommand({ KeyId: id, PendingWindowInDays: MIN_PENDING_DAYS }))
      .catch(() => undefined);
  }
});

describe("keys", () => {
  it("lists a new key as customer managed", async () => {
    const { Keys = [] } = await kms.send(new ListKeysCommand({}));
    expect(Keys.map((key) => key.KeyId)).toContain(keyId);

    const { KeyMetadata } = await kms.send(new DescribeKeyCommand({ KeyId: keyId }));
    expect(KeyMetadata?.KeyManager).toBe("CUSTOMER");
    expect(KeyMetadata?.KeyState).toBe("Enabled");
  });

  it("refuses to encrypt with a disabled key", async () => {
    await kms.send(new DisableKeyCommand({ KeyId: keyId }));
    await expect(
      kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: PLAINTEXT })),
    ).rejects.toMatchObject({ name: "DisabledException" });

    await kms.send(new EnableKeyCommand({ KeyId: keyId }));
    expect(await stateOf(keyId)).toBe("Enabled");
  });

  it("schedules deletion, then cancelling leaves the key enabled (AWS: disabled)", async () => {
    await kms.send(
      new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: MIN_PENDING_DAYS }),
    );
    expect(await stateOf(keyId)).toBe("PendingDeletion");
    await expect(
      kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: PLAINTEXT })),
    ).rejects.toMatchObject({ name: "KMSInvalidStateException" });

    await kms.send(new CancelKeyDeletionCommand({ KeyId: keyId }));
    expect(await stateOf(keyId)).toBe("Enabled");
  });

  it("answers a missing key with NotFoundException and HTTP 400", async () => {
    await expect(kms.send(new DescribeKeyCommand({ KeyId: MISSING_KEY }))).rejects.toMatchObject({
      name: "NotFoundException",
      $metadata: { httpStatusCode: 400 },
    });
  });
});

describe("try it", () => {
  const MESSAGE = new TextEncoder().encode("xin chào");

  const createKey = async (input: ConstructorParameters<typeof CreateKeyCommand>[0]) => {
    const { KeyMetadata } = await kms.send(new CreateKeyCommand(input));
    const id = KeyMetadata?.KeyId ?? "";
    created.push(id);
    return id;
  };

  it("decrypts only with the same encryption context", async () => {
    const context = { app: "orders" };
    const { CiphertextBlob } = await kms.send(
      new EncryptCommand({ KeyId: keyId, Plaintext: PLAINTEXT, EncryptionContext: context }),
    );
    const { Plaintext } = await kms.send(
      new DecryptCommand({ CiphertextBlob, EncryptionContext: context }),
    );
    expect(new TextDecoder().decode(Plaintext)).toBe("xin chào");

    await expect(
      kms.send(new DecryptCommand({ CiphertextBlob, EncryptionContext: { app: "other" } })),
    ).rejects.toMatchObject({ name: "InvalidCiphertextException" });
  });

  it("verifies a signature and rejects another message", async () => {
    const id = await createKey({ KeySpec: "ECC_NIST_P256", KeyUsage: "SIGN_VERIFY" });
    const SigningAlgorithm = "ECDSA_SHA_256";
    const { Signature } = await kms.send(
      new SignCommand({ KeyId: id, Message: MESSAGE, SigningAlgorithm }),
    );
    const { SignatureValid } = await kms.send(
      new VerifyCommand({ KeyId: id, Message: MESSAGE, Signature, SigningAlgorithm }),
    );
    expect(SignatureValid).toBe(true);

    await expect(
      kms.send(
        new VerifyCommand({ KeyId: id, Message: PLAINTEXT.slice(1), Signature, SigningAlgorithm }),
      ),
    ).rejects.toMatchObject({ name: "KMSInvalidSignatureException" });
  });

  it("verifies a MAC", async () => {
    const id = await createKey({ KeySpec: "HMAC_256", KeyUsage: "GENERATE_VERIFY_MAC" });
    const MacAlgorithm = "HMAC_SHA_256";
    const { Mac } = await kms.send(
      new GenerateMacCommand({ KeyId: id, Message: MESSAGE, MacAlgorithm }),
    );
    const { MacValid } = await kms.send(
      new VerifyMacCommand({ KeyId: id, Message: MESSAGE, Mac, MacAlgorithm }),
    );
    expect(MacValid).toBe(true);
  });
});

describe("lambda environment key", () => {
  // Console gửi KMSKeyArn "" khi người dùng gỡ key: Floci phải nhận và bỏ key
  it("clears the key with an empty KMSKeyArn", async () => {
    const lambda = new LambdaClient(viaConsole((await consoleConfig()).region));
    const functionName = uniqueName("kmsfn");
    const { KeyMetadata } = await kms.send(
      new CreateKeyCommand({ Description: uniqueName("kms") }),
    );
    created.push(KeyMetadata?.KeyId ?? "");

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: {
          ZipFile: zipSync({ "index.mjs": strToU8("export const handler = async () => 1;") }),
        },
        KMSKeyArn: KeyMetadata?.Arn,
      }),
    );
    try {
      const configuration = () =>
        lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
      await waitFor("function to be Active", async () =>
        (await configuration()).State === "Active" ? true : undefined,
      );
      expect((await configuration()).KMSKeyArn).toBe(KeyMetadata?.Arn);

      await lambda.send(
        new UpdateFunctionConfigurationCommand({ FunctionName: functionName, KMSKeyArn: "" }),
      );
      expect((await configuration()).KMSKeyArn || "").toBe("");
    } finally {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    }
  });
});
