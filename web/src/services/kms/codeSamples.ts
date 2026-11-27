import type { KeyMetadata } from "@aws-sdk/client-kms";
import { lines } from "@localconsole/core/shared";
import {
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  SAMPLE_TEXT,
  type CodeSample,
} from "@shared/codeSamples.ts";
import { KEY_USAGES, SYMMETRIC_SPEC, preferredRsaAlgorithm } from "@localconsole/core/kms";

type KeyInfo = Pick<
  KeyMetadata,
  "KeyUsage" | "KeySpec" | "EncryptionAlgorithms" | "SigningAlgorithms" | "MacAlgorithms"
>;

const IMPORT_NODE = (commands: string) =>
  `import { KMSClient, ${commands} } from "@aws-sdk/client-kms";`;

function encryptSample(key: string, algorithm?: string): CodeSample {
  const nodeAlgorithm = algorithm ? [`  EncryptionAlgorithm: ${literal(algorithm)},`] : [];
  const pythonAlgorithm = algorithm ? `, EncryptionAlgorithm=${literal(algorithm)}` : "";

  return {
    node: lines(
      NODE_AWS_NOTE,
      IMPORT_NODE("EncryptCommand, DecryptCommand"),
      "",
      "const kms = new KMSClient({});",
      `const KeyId = ${literal(key)};`,
      "const { CiphertextBlob } = await kms.send(new EncryptCommand({",
      "  KeyId,",
      `  Plaintext: new TextEncoder().encode(${literal(SAMPLE_TEXT)}),`,
      ...nodeAlgorithm,
      "}));",
      "const { Plaintext } = await kms.send(new DecryptCommand({",
      "  KeyId,",
      "  CiphertextBlob,",
      ...nodeAlgorithm,
      "}));",
      "console.log(new TextDecoder().decode(Plaintext));",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'kms = boto3.client("kms")',
      `key_id = ${literal(key)}`,
      `blob = kms.encrypt(KeyId=key_id, Plaintext=${literal(SAMPLE_TEXT)}.encode()${pythonAlgorithm})["CiphertextBlob"]`,
      `plain = kms.decrypt(KeyId=key_id, CiphertextBlob=blob${pythonAlgorithm})["Plaintext"]`,
      "print(plain.decode())",
    ),
  };
}

function signSample(key: string, algorithm: string): CodeSample {
  return {
    node: lines(
      NODE_AWS_NOTE,
      IMPORT_NODE("SignCommand, VerifyCommand"),
      "",
      "const kms = new KMSClient({});",
      `const KeyId = ${literal(key)};`,
      `const SigningAlgorithm = ${literal(algorithm)};`,
      `const Message = new TextEncoder().encode(${literal(SAMPLE_TEXT)});`,
      "const { Signature } = await kms.send(",
      "  new SignCommand({ KeyId, Message, SigningAlgorithm }),",
      ");",
      "const { SignatureValid } = await kms.send(",
      "  new VerifyCommand({ KeyId, Message, Signature, SigningAlgorithm }),",
      ");",
      "console.log(SignatureValid);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'kms = boto3.client("kms")',
      `key_id = ${literal(key)}`,
      `algorithm = ${literal(algorithm)}`,
      `message = ${literal(SAMPLE_TEXT)}.encode()`,
      'signature = kms.sign(KeyId=key_id, Message=message, SigningAlgorithm=algorithm)["Signature"]',
      "result = kms.verify(",
      "    KeyId=key_id, Message=message, Signature=signature, SigningAlgorithm=algorithm",
      ")",
      'print(result["SignatureValid"])',
    ),
  };
}

function macSample(key: string, algorithm: string): CodeSample {
  return {
    node: lines(
      NODE_AWS_NOTE,
      IMPORT_NODE("GenerateMacCommand, VerifyMacCommand"),
      "",
      "const kms = new KMSClient({});",
      `const KeyId = ${literal(key)};`,
      `const MacAlgorithm = ${literal(algorithm)};`,
      `const Message = new TextEncoder().encode(${literal(SAMPLE_TEXT)});`,
      "const { Mac } = await kms.send(new GenerateMacCommand({ KeyId, Message, MacAlgorithm }));",
      "const { MacValid } = await kms.send(",
      "  new VerifyMacCommand({ KeyId, Message, Mac, MacAlgorithm }),",
      ");",
      "console.log(MacValid);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'kms = boto3.client("kms")',
      `key_id = ${literal(key)}`,
      `algorithm = ${literal(algorithm)}`,
      `message = ${literal(SAMPLE_TEXT)}.encode()`,
      'mac = kms.generate_mac(KeyId=key_id, Message=message, MacAlgorithm=algorithm)["Mac"]',
      "result = kms.verify_mac(KeyId=key_id, Message=message, Mac=mac, MacAlgorithm=algorithm)",
      'print(result["MacValid"])',
    ),
  };
}

// Code cho thẻ Connect theo cách dùng của key; reference là alias đầu tiên hoặc KeyId
export function keySample(meta: KeyInfo, reference: string): CodeSample {
  if (meta.KeyUsage === KEY_USAGES.sign) {
    return signSample(reference, meta.SigningAlgorithms?.[0] ?? "");
  }
  if (meta.KeyUsage === KEY_USAGES.mac) return macSample(reference, meta.MacAlgorithms?.[0] ?? "");
  if (meta.KeySpec === SYMMETRIC_SPEC) return encryptSample(reference);

  return encryptSample(reference, preferredRsaAlgorithm(meta.EncryptionAlgorithms ?? []));
}
