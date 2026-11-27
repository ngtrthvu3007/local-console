import { z } from "zod";
import { byteLength } from "#shared/utils/format.ts";
import { enumOfKeys } from "#shared/validation/schemas.ts";
import {
  ALIAS_PREFIX,
  AWS_ALIAS_PREFIX,
  CRYPTO_INPUT_MAX_BYTES,
  KEY_ARN_PREFIX,
  KEY_SPECS,
  KEY_TYPES,
  KEY_USAGES,
  PENDING_WINDOW_DAYS,
  type KeySpecValue,
} from "./constants.ts";
import { normalizeAlias } from "./keys.ts";

const AWS_ALIAS_ERROR = `Can't start with ${AWS_ALIAS_PREFIX}: AWS reserves it.`;

const aliasName = z
  .string()
  .trim()
  .transform((name) => (name ? normalizeAlias(name) : ""))
  .refine((name) => !name.startsWith(AWS_ALIAS_PREFIX), AWS_ALIAS_ERROR);

export const specsFor = (type: string, usage: string): readonly KeySpecValue[] => {
  if (type === "symmetric") return KEY_SPECS.symmetric;
  if (type === "hmac") return KEY_SPECS.hmac;
  return usage === KEY_USAGES.sign ? KEY_SPECS.sign : KEY_SPECS.encrypt;
};

export const createKeySchema = (existing: readonly string[]) =>
  z
    .object({
      type: enumOfKeys(KEY_TYPES),
      usage: z.enum([KEY_USAGES.encrypt, KEY_USAGES.sign, KEY_USAGES.mac]),
      // Union các KeySpec trong constants (RSA mã hóa nằm trong danh sách ký) để khớp kiểu KeySpec của SDK
      spec: z.enum([...KEY_SPECS.symmetric, ...KEY_SPECS.sign, ...KEY_SPECS.hmac]),
      // Floci nhận alias trùng (spec 7 #4): chặn tên key khác đã có
      alias: aliasName.refine(
        (name) => !name || !existing.includes(name),
        "This alias already exists.",
      ),
      description: z.string().trim(),
    })
    .superRefine((form, context) => {
      if (!specsFor(form.type, form.usage).includes(form.spec)) {
        context.addIssue({ code: "custom", path: ["spec"], message: "Choose a key spec." });
      }
    });

export type CreateKeyForm = z.input<ReturnType<typeof createKeySchema>>;
export type NewKey = z.output<ReturnType<typeof createKeySchema>>;

// Floci nhận alias trùng tên (spec 7 #4) nên form tự chặn
export const aliasSchema = (existing: readonly string[]) =>
  z.object({
    name: aliasName
      .refine(Boolean, "Enter an alias name.")
      .refine((name) => !existing.includes(name), "This alias already exists."),
  });

export const scheduleDeletionSchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(PENDING_WINDOW_DAYS.min, `Must be at least ${PENDING_WINDOW_DAYS.min} days.`)
    .max(PENDING_WINDOW_DAYS.max, `Must be at most ${PENDING_WINDOW_DAYS.max} days.`),
});

export const tryItInputSchema = z
  .string()
  .min(1, "Enter a value.")
  .refine(
    (text) => byteLength(text) <= CRYPTO_INPUT_MAX_BYTES,
    `Must be at most ${CRYPTO_INPUT_MAX_BYTES} bytes.`,
  );

// Ciphertext / chữ ký / MAC dán vào là base64: dài hơn plaintext nên không áp giới hạn 4096
export const ciphertextSchema = z.string().trim().min(1, "Enter a value.");

export const descriptionSchema = z.object({ description: z.string().trim() });

// Đã chọn "Enter a key…" mà chưa gõ: giá trị này không hợp lệ để form báo lỗi, thay vì lặng lẽ dùng key mặc định
export const KEY_PENDING = "key-pending";

// Lambda chỉ nhận ARN cho KMSKeyArn
export const kmsKeyArnSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || value.startsWith(KEY_ARN_PREFIX), "Enter a KMS key ARN.");

// Key ID trơn (UUID) mà resource tạo bằng CLI có thể đang lưu (put-parameter --key-id …)
const KEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ô chọn key ở service khác: "" = key mặc định của service; KeySelect gửi ARN key, còn alias là giá trị
// resource tạo ngoài console có thể đang lưu (vd parameter SSM: alias/aws/ssm)
export const kmsKeyIdSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      value.startsWith(KEY_ARN_PREFIX) ||
      value.startsWith(ALIAS_PREFIX) ||
      KEY_ID_PATTERN.test(value),
    "Enter a KMS key ID, ARN or alias.",
  );
