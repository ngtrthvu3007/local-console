import { describe, expect, it } from "vitest";
import { apiSample } from "../../src/services/appsync/codeSamples.ts";
import { distributionSample } from "../../src/services/cloudfront/codeSamples.ts";
import { clientSample } from "../../src/services/cognito/codeSamples.ts";
import { tableSample } from "../../src/services/dynamodb/codeSamples.ts";
import { streamSample } from "../../src/services/kinesis/codeSamples.ts";
import { keySample } from "../../src/services/kms/codeSamples.ts";
import { secretSample } from "../../src/services/secretsmanager/codeSamples.ts";
import { parameterSample } from "../../src/services/ssm/codeSamples.ts";
import { brokerUrl } from "../../src/services/mq/codeSamples.ts";
import { bucketSample } from "../../src/services/s3/codeSamples.ts";
import { senderOf } from "../../src/services/ses/codeSamples.ts";
import { queueSample } from "../../src/services/sqs/codeSamples.ts";
import type { Queue } from "../../src/services/sqs/queues.ts";

const queue = (fifo: boolean, contentBasedDedup: boolean) =>
  ({
    url: "http://localhost.floci.io:4566/000000000000/orders.fifo",
    fifo,
    settings: { contentBasedDedup },
  }) as Queue;

describe("code samples", () => {
  it("adds FIFO fields only when the queue needs them", () => {
    const standard = queueSample(queue(false, false));
    expect(standard.node).not.toContain("MessageGroupId");
    const deduped = queueSample(queue(true, true));
    expect(deduped.python).toContain("MessageGroupId=");
    expect(deduped.python).not.toContain("MessageDeduplicationId");
    const fifo = queueSample(queue(true, false));
    expect(fifo.node).toContain("MessageDeduplicationId: crypto.randomUUID()");
    expect(fifo.python).toContain("import uuid");
  });

  it("puts a record and reads the first shard of the stream", () => {
    const sample = streamSample("clicks");
    expect(sample.node).toContain('const StreamName = "clicks";');
    expect(sample.node).toContain("PutRecordCommand");
    expect(sample.node).toContain('ShardIteratorType: "TRIM_HORIZON"');
    expect(sample.python).toContain('stream = "clicks"');
    expect(sample.python).toContain("kinesis.get_records(");
  });

  it("uses path-style S3 in both languages", () => {
    const sample = bucketSample("my-bucket");
    expect(sample.node).toContain("forcePathStyle: true");
    expect(sample.python).toContain('"addressing_style": "path"');
  });

  it("fills the table's own key names and types", () => {
    const sample = tableSample("orders", [
      { name: "pk", type: "S" },
      { name: "sk", type: "N" },
    ]);

    expect(sample.node).toContain('const Key = { "pk": "example", "sk": 1 };');
    expect(sample.python).toContain('key = { "pk": "example", "sk": 1 }');
  });

  it("escapes names into valid string literals", () => {
    expect(bucketSample('a"b').node).toContain('const Bucket = "a\\"b";');
  });

  it("sends from an address of a domain identity", () => {
    expect(senderOf("dev@app.local")).toBe("dev@app.local");
    expect(senderOf("app.local")).toBe("noreply@app.local");
  });

  it("decrypts only SecureString parameters and splits only StringList ones", () => {
    const secure = parameterSample("/app/db-password", "SecureString");
    expect(secure.node).toContain("WithDecryption: true");
    expect(secure.python).toContain("WithDecryption=True");
    const plain = parameterSample("/app/host", "String");
    expect(plain.node).not.toContain("WithDecryption");
    expect(plain.node).not.toContain(".split(");
    expect(parameterSample("/app/hosts", "StringList").python).toContain('.split(",")');
  });

  it("reads the secret by its name", () => {
    const sample = secretSample("prod/db");
    expect(sample.node).toContain('SecretId: "prod/db"');
    expect(sample.python).toContain('SecretId="prod/db"');
  });

  it("adds SECRET_HASH only for a client with a secret, read from the environment", () => {
    const flows = ["ALLOW_USER_PASSWORD_AUTH"];
    const publicClient = clientSample({ ClientId: "abc", ExplicitAuthFlows: flows });
    expect(publicClient.node).toContain('const ClientId = "abc";');
    expect(publicClient.node).not.toContain("SECRET_HASH");
    expect(publicClient.node).not.toContain("Turn on");

    const secret = "s3cr3t-value";
    const withSecret = clientSample({
      ClientId: "abc",
      ClientSecret: secret,
      ExplicitAuthFlows: flows,
    });
    expect(withSecret.node).toContain("process.env.COGNITO_CLIENT_SECRET");
    expect(withSecret.python).toContain('params["SECRET_HASH"]');
    expect(withSecret.node + withSecret.python).not.toContain(secret);
  });

  it("says to turn on USER_PASSWORD_AUTH when the client doesn't allow it", () => {
    expect(clientSample({ ClientId: "abc", ExplicitAuthFlows: [] }).python).toContain(
      "# Turn on ALLOW_USER_PASSWORD_AUTH",
    );
  });

  it("calls a GraphQL API with the header its authorization needs", () => {
    const endpoint = "http://localhost:4566/v1/apis/a1/graphql";
    const withKey = apiSample({ endpoint, authType: "API_KEY", apiKey: "da2-x" });
    expect(withKey.node).toContain('"x-api-key"');
    expect(withKey.node).toContain('"da2-x"');
    expect(withKey.python).toContain("requests.post");
    // Code chép ra chạy được: token là chuỗi giữ chỗ, không phải biến chưa khai báo
    const cognito = apiSample({ endpoint, authType: "AMAZON_COGNITO_USER_POOLS" });
    expect(cognito.node).toContain("Bearer YOUR_ID_TOKEN");
    expect(cognito.python).toContain("Bearer YOUR_ID_TOKEN");
    const iam = apiSample({ endpoint, authType: "AWS_IAM" });
    expect(iam.node).toContain("SigV4");
    expect(iam.node).not.toContain("x-api-key");
  });

  it("invalidates the whole distribution like a deploy script", () => {
    const sample = distributionSample("E2ABC");
    expect(sample.node).toContain("CreateInvalidationCommand");
    expect(sample.node).toContain('"E2ABC"');
    expect(sample.node).toContain('"/*"');
    expect(sample.python).toContain("create_invalidation");
    expect(sample.python).toContain('"E2ABC"');
  });

  it("fills the key and picks the calls by key usage", () => {
    const signing = keySample(
      { KeyUsage: "SIGN_VERIFY", KeySpec: "ECC_NIST_P256", SigningAlgorithms: ["ECDSA_SHA_256"] },
      "alias/jwt",
    );
    expect(signing.node).toContain("SignCommand");
    expect(signing.node).toContain('"ECDSA_SHA_256"');
    expect(signing.node).toContain('const KeyId = "alias/jwt";');

    const symmetric = keySample(
      { KeyUsage: "ENCRYPT_DECRYPT", KeySpec: "SYMMETRIC_DEFAULT" },
      "alias/orders",
    );
    expect(symmetric.node).toContain("EncryptCommand");
    expect(symmetric.node).toContain("DecryptCommand");
    expect(symmetric.node).not.toContain("EncryptionAlgorithm");

    const rsa = keySample(
      {
        KeyUsage: "ENCRYPT_DECRYPT",
        KeySpec: "RSA_2048",
        EncryptionAlgorithms: ["RSAES_OAEP_SHA_256"],
      },
      "1234",
    );
    expect(rsa.python).toContain('EncryptionAlgorithm="RSAES_OAEP_SHA_256"');

    const mac = keySample(
      { KeyUsage: "GENERATE_VERIFY_MAC", KeySpec: "HMAC_256", MacAlgorithms: ["HMAC_SHA_256"] },
      "1234",
    );
    expect(mac.python).toContain("generate_mac");
  });

  it("leaves user and password to fill in the AMQP URL", () => {
    expect(brokerUrl("amqp://172.28.0.4:5672")).toBe("amqp://USER:PASSWORD@172.28.0.4:5672");
  });
});
