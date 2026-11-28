import {
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
  GenerateMacCommand,
  GetPublicKeyCommand,
  SignCommand,
  VerifyCommand,
  VerifyMacCommand,
  type EncryptionAlgorithmSpec,
  type KMSClient,
  type MacAlgorithmSpec,
  type SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import { toBase64 } from "#shared/utils/encoding.ts";
import type { KeyValue } from "#shared/types/keyValue.ts";
import { contextOf, derToPem, parseBase64 } from "#services/kms/keys.ts";

const INVALID_SIGNATURE_ERROR = "KMSInvalidSignatureException";
const INVALID_MAC_ERROR = "KMSInvalidMacException";
const DATA_KEY_SPEC = "AES_256";

const utf8 = (text: string) => new TextEncoder().encode(text);
const bytesOrEmpty = (bytes?: Uint8Array) => toBase64(bytes ?? new Uint8Array());

const falseWhen = (errorName: string) => (error: unknown) => {
  if ((error as { name?: string } | undefined)?.name === errorName) return false;
  throw error;
};

export interface EncryptInput {
  keyId: string;
  algorithm?: EncryptionAlgorithmSpec;
  input: string;
  context: readonly KeyValue[];
}

export interface SignInput {
  keyId: string;
  input: string;
  algorithm: SigningAlgorithmSpec;
}

export interface MacInput {
  keyId: string;
  input: string;
  algorithm: MacAlgorithmSpec;
}

export interface VerifyInput extends SignInput {
  signature: string;
}

export interface VerifyMacInput extends MacInput {
  mac: string;
}

export async function encrypt(kms: KMSClient, { keyId, algorithm, input, context }: EncryptInput) {
  const { CiphertextBlob } = await kms.send(
    new EncryptCommand({
      KeyId: keyId,
      Plaintext: utf8(input),
      EncryptionContext: contextOf(context),
      EncryptionAlgorithm: algorithm,
    }),
  );
  return bytesOrEmpty(CiphertextBlob);
}

export async function decrypt(kms: KMSClient, { keyId, algorithm, input, context }: EncryptInput) {
  const { Plaintext } = await kms.send(
    new DecryptCommand({
      KeyId: keyId,
      CiphertextBlob: parseBase64(input),
      EncryptionContext: contextOf(context),
      EncryptionAlgorithm: algorithm,
    }),
  );
  return new TextDecoder().decode(Plaintext);
}

export async function generateDataKey(kms: KMSClient, keyId: string) {
  const { Plaintext, CiphertextBlob } = await kms.send(
    new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: DATA_KEY_SPEC }),
  );
  return { plaintext: bytesOrEmpty(Plaintext), ciphertext: bytesOrEmpty(CiphertextBlob) };
}

export async function sign(kms: KMSClient, { keyId, input, algorithm }: SignInput) {
  const { Signature } = await kms.send(
    new SignCommand({ KeyId: keyId, Message: utf8(input), SigningAlgorithm: algorithm }),
  );
  return bytesOrEmpty(Signature);
}

export const verify = (kms: KMSClient, { keyId, input, algorithm, signature }: VerifyInput) =>
  kms
    .send(
      new VerifyCommand({
        KeyId: keyId,
        Message: utf8(input),
        Signature: parseBase64(signature),
        SigningAlgorithm: algorithm,
      }),
    )
    .then(({ SignatureValid }) => Boolean(SignatureValid), falseWhen(INVALID_SIGNATURE_ERROR));

export async function generateMac(kms: KMSClient, { keyId, input, algorithm }: MacInput) {
  const { Mac } = await kms.send(
    new GenerateMacCommand({ KeyId: keyId, Message: utf8(input), MacAlgorithm: algorithm }),
  );
  return bytesOrEmpty(Mac);
}

export const verifyMac = (kms: KMSClient, { keyId, input, algorithm, mac }: VerifyMacInput) =>
  kms
    .send(
      new VerifyMacCommand({
        KeyId: keyId,
        Message: utf8(input),
        Mac: parseBase64(mac),
        MacAlgorithm: algorithm,
      }),
    )
    .then(({ MacValid }) => Boolean(MacValid), falseWhen(INVALID_MAC_ERROR));

export async function getPublicKey(kms: KMSClient, keyId: string) {
  const { PublicKey } = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }));
  return derToPem(bytesOrEmpty(PublicKey));
}
