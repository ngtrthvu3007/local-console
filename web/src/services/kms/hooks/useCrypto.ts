import { useMutation, useQuery } from "@tanstack/react-query";
import type { EncryptionAlgorithmSpec } from "@aws-sdk/client-kms";
import type {
  EncryptInput,
  MacInput,
  SignInput,
  VerifyInput,
  VerifyMacInput,
} from "@localconsole/core/kms";
import { KMS_QUERY_ROOT } from "./useKeys.ts";
import { useKmsService } from "./useKmsService.ts";

type FormInput<T> = Omit<T, "keyId" | "algorithm">;

export function useEncrypt(keyId: string, algorithm?: EncryptionAlgorithmSpec) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: FormInput<EncryptInput>) => kms.encrypt({ ...input, keyId, algorithm }),
  });
}

export function useDecrypt(keyId: string, algorithm?: EncryptionAlgorithmSpec) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: FormInput<EncryptInput>) => kms.decrypt({ ...input, keyId, algorithm }),
  });
}

export function useGenerateDataKey(keyId: string) {
  const kms = useKmsService();

  return useMutation({ mutationFn: () => kms.generateDataKey(keyId) });
}

export function useSign(keyId: string) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: Omit<SignInput, "keyId">) => kms.sign({ ...input, keyId }),
  });
}

export function useVerify(keyId: string) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: Omit<VerifyInput, "keyId">) => kms.verify({ ...input, keyId }),
  });
}

export function useGenerateMac(keyId: string) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: Omit<MacInput, "keyId">) => kms.generateMac({ ...input, keyId }),
  });
}

export function useVerifyMac(keyId: string) {
  const kms = useKmsService();

  return useMutation({
    mutationFn: (input: Omit<VerifyMacInput, "keyId">) => kms.verifyMac({ ...input, keyId }),
  });
}

export function usePublicKey(keyId: string) {
  const kms = useKmsService();

  return useQuery({
    queryKey: [KMS_QUERY_ROOT, "key", keyId, "public-key"],
    queryFn: () => kms.getPublicKey(keyId),
  });
}
