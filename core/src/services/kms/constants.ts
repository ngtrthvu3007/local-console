export const KEY_STATES = {
  enabled: "Enabled",
  disabled: "Disabled",
  pendingDeletion: "PendingDeletion",
} as const;

export const KEY_MANAGERS = { customer: "CUSTOMER", aws: "AWS" } as const;
export type KeyManager = (typeof KEY_MANAGERS)[keyof typeof KEY_MANAGERS];

export const KEY_USAGES = {
  encrypt: "ENCRYPT_DECRYPT",
  sign: "SIGN_VERIFY",
  mac: "GENERATE_VERIFY_MAC",
} as const;
export type KeyUsage = (typeof KEY_USAGES)[keyof typeof KEY_USAGES];

export const KEY_USAGE_LABELS: Record<string, string> = {
  ENCRYPT_DECRYPT: "Encrypt and decrypt",
  SIGN_VERIFY: "Sign and verify",
  GENERATE_VERIFY_MAC: "Generate and verify MAC",
};
export const SYMMETRIC_SPEC = "SYMMETRIC_DEFAULT";

export const KEY_TYPES = {
  symmetric: { label: "Symmetric", description: "One key to encrypt and decrypt." },
  asymmetric: { label: "Asymmetric", description: "A key pair to sign or to encrypt." },
  hmac: { label: "HMAC", description: "Generate and verify message authentication codes." },
} as const;
export type KeyType = keyof typeof KEY_TYPES;

export const KEY_SPECS = {
  symmetric: [SYMMETRIC_SPEC],
  sign: ["RSA_2048", "RSA_3072", "RSA_4096", "ECC_NIST_P256", "ECC_NIST_P384", "ECC_NIST_P521"],
  encrypt: ["RSA_2048", "RSA_3072", "RSA_4096"],
  hmac: ["HMAC_224", "HMAC_256", "HMAC_384", "HMAC_512"],
} as const;
export type KeySpecValue = (typeof KEY_SPECS)[keyof typeof KEY_SPECS][number];

// AWS: chờ xóa 7–30 ngày, mặc định 30; Floci nhận cả 6 và 31 nên form tự chặn
export const PENDING_WINDOW_DAYS = { min: 7, max: 30, default: 30 } as const;

export const ALIAS_PREFIX = "alias/";
export const KEY_ARN_PREFIX = "arn:aws:kms:";
export const AWS_ALIAS_PREFIX = "alias/aws/";
// Giới hạn của AWS cho plaintext Encrypt, message Sign / MAC
export const CRYPTO_INPUT_MAX_BYTES = 4096;
// Floci báo key không có bằng lỗi này kèm HTTP 400, không phải 404
export const KMS_NOT_FOUND_ERROR = "NotFoundException";
