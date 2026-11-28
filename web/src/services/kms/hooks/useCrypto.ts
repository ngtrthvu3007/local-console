import { useMutation, useQuery } from "@tanstack/react-query";
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
  type MacAlgorithmSpec,
  type SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import type { KeyValue } from "@shared/components/KeyValueEditor.tsx";
import { toBase64 } from "../../dynamodb/itemJson.ts";
import { contextOf, derToPem, parseBase64 } from "../keys.ts";
import { KMS_QUERY_ROOT } from "./useKeys.ts";
import { useKMS } from "./useKMS.ts";

// Floci trả lỗi (không phải Valid=false) khi chữ ký / MAC sai: coi là "Invalid" chứ không phải lỗi
const INVALID_SIGNATURE_ERROR = "KMSInvalidSignatureException";
const INVALID_MAC_ERROR = "KMSInvalidMacException";
const DATA_KEY_SPEC = "AES_256";

const utf8 = (text: string) => new TextEncoder().encode(text);
const bytesOrEmpty = (bytes?: Uint8Array) => toBase64(bytes ?? new Uint8Array());

const falseWhen = (errorName: string) => (error: unknown) => {
  if ((error as { name?: string } | undefined)?.name === errorName) return false;
  throw error;
};

interface EncryptInput {
  input: string;
  context: readonly KeyValue[];
}

// Thuật toán chỉ cho key RSA; key đối xứng để trống
export function useEncrypt(keyId: string, algorithm?: EncryptionAlgorithmSpec) {
  const client = useKMS();

  return useMutation({
    mutationFn: async ({ input, context }: EncryptInput) => {
      const { CiphertextBlob } = await client.send(
        new EncryptCommand({
          KeyId: keyId,
          Plaintext: utf8(input),
          EncryptionContext: contextOf(context),
          EncryptionAlgorithm: algorithm,
        }),
      );
      return bytesOrEmpty(CiphertextBlob);
    },
  });
}

export function useDecrypt(keyId: string, algorithm?: EncryptionAlgorithmSpec) {
  const client = useKMS();

  return useMutation({
    mutationFn: async ({ input, context }: EncryptInput) => {
      const { Plaintext } = await client.send(
        new DecryptCommand({
          KeyId: keyId,
          CiphertextBlob: parseBase64(input),
          EncryptionContext: contextOf(context),
          EncryptionAlgorithm: algorithm,
        }),
      );
      return new TextDecoder().decode(Plaintext);
    },
  });
}

export function useGenerateDataKey(keyId: string) {
  const client = useKMS();

  return useMutation({
    mutationFn: async () => {
      const { Plaintext, CiphertextBlob } = await client.send(
        new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: DATA_KEY_SPEC }),
      );
      return { plaintext: bytesOrEmpty(Plaintext), ciphertext: bytesOrEmpty(CiphertextBlob) };
    },
  });
}

export function useSign(keyId: string) {
  const client = useKMS();

  return useMutation({
    mutationFn: async ({
      input,
      algorithm,
    }: {
      input: string;
      algorithm: SigningAlgorithmSpec;
    }) => {
      const { Signature } = await client.send(
        new SignCommand({ KeyId: keyId, Message: utf8(input), SigningAlgorithm: algorithm }),
      );
      return bytesOrEmpty(Signature);
    },
  });
}

export function useVerify(keyId: string) {
  const client = useKMS();

  return useMutation({
    mutationFn: ({
      input,
      signature,
      algorithm,
    }: {
      input: string;
      signature: string;
      algorithm: SigningAlgorithmSpec;
    }) =>
      client
        .send(
          new VerifyCommand({
            KeyId: keyId,
            Message: utf8(input),
            Signature: parseBase64(signature),
            SigningAlgorithm: algorithm,
          }),
        )
        .then(({ SignatureValid }) => Boolean(SignatureValid), falseWhen(INVALID_SIGNATURE_ERROR)),
  });
}

export function useGenerateMac(keyId: string) {
  const client = useKMS();

  return useMutation({
    mutationFn: async ({ input, algorithm }: { input: string; algorithm: MacAlgorithmSpec }) => {
      const { Mac } = await client.send(
        new GenerateMacCommand({ KeyId: keyId, Message: utf8(input), MacAlgorithm: algorithm }),
      );
      return bytesOrEmpty(Mac);
    },
  });
}

export function useVerifyMac(keyId: string) {
  const client = useKMS();

  return useMutation({
    mutationFn: ({
      input,
      mac,
      algorithm,
    }: {
      input: string;
      mac: string;
      algorithm: MacAlgorithmSpec;
    }) =>
      client
        .send(
          new VerifyMacCommand({
            KeyId: keyId,
            Message: utf8(input),
            Mac: parseBase64(mac),
            MacAlgorithm: algorithm,
          }),
        )
        .then(({ MacValid }) => Boolean(MacValid), falseWhen(INVALID_MAC_ERROR)),
  });
}

export function usePublicKey(keyId: string) {
  const client = useKMS();

  return useQuery({
    queryKey: [KMS_QUERY_ROOT, "key", keyId, "public-key"],
    queryFn: async () => {
      const { PublicKey } = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
      return derToPem(bytesOrEmpty(PublicKey));
    },
  });
}
