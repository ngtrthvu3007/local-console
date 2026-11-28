import type { KMSClient } from "@aws-sdk/client-kms";
import type { KeyManager } from "./constants.ts";
import type { NewKey } from "./schemas.ts";
import { deleteAlias, saveAlias, type AliasInput } from "./operations/aliases.ts";
import {
  decrypt,
  encrypt,
  generateDataKey,
  generateMac,
  getPublicKey,
  sign,
  verify,
  verifyMac,
  type EncryptInput,
  type MacInput,
  type SignInput,
  type VerifyInput,
  type VerifyMacInput,
} from "./operations/crypto.ts";
import {
  createKey,
  getKey,
  getKeyPolicy,
  keyAction,
  keyExists,
  listAliases,
  listKeyOptions,
  listKeys,
  updateDescription,
  type KeyActionInput,
} from "./operations/keys.ts";

export function createKmsService(kms: KMSClient) {
  return {
    listKeys: (manager: KeyManager) => listKeys(kms, manager),
    getKey: (key: string) => getKey(kms, key),
    keyExists: (key: string) => keyExists(kms, key),
    keyAction: (input: KeyActionInput) => keyAction(kms, input),
    getKeyPolicy: (keyId: string) => getKeyPolicy(kms, keyId),
    updateDescription: (input: { keyId: string; description: string }) =>
      updateDescription(kms, input),
    createKey: (input: NewKey) => createKey(kms, input),
    listKeyOptions: () => listKeyOptions(kms),
    listAliases: () => listAliases(kms),
    saveAlias: (input: AliasInput) => saveAlias(kms, input),
    deleteAlias: (name: string) => deleteAlias(kms, name),
    encrypt: (input: EncryptInput) => encrypt(kms, input),
    decrypt: (input: EncryptInput) => decrypt(kms, input),
    generateDataKey: (keyId: string) => generateDataKey(kms, keyId),
    sign: (input: SignInput) => sign(kms, input),
    verify: (input: VerifyInput) => verify(kms, input),
    generateMac: (input: MacInput) => generateMac(kms, input),
    verifyMac: (input: VerifyMacInput) => verifyMac(kms, input),
    getPublicKey: (keyId: string) => getPublicKey(kms, keyId),
  };
}
