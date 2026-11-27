import { z } from "zod";
import { kmsKeyIdSchema } from "#services/kms/schemas.ts";
import { enumOfKeys, lowercaseName } from "#shared/validation/schemas.ts";
import {
  CREDENTIAL_TYPES,
  DATABASE_NAME_PATTERN,
  ENGINE_LABELS,
  IDENTIFIER_MAX_LENGTH,
  PASSWORD_MAX_LENGTHS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_RULE,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from "./constants.ts";

export const createDatabaseSchema = z
  .object({
    engine: enumOfKeys(ENGINE_LABELS),
    identifier: lowercaseName("a DB identifier", IDENTIFIER_MAX_LENGTH),
    username: z
      .string()
      .trim()
      .min(1, "Enter a master username.")
      .max(USERNAME_MAX_LENGTH, `Must be at most ${USERNAME_MAX_LENGTH} characters.`)
      .regex(USERNAME_PATTERN, "Start with a letter; use letters, numbers and underscores."),
    credentials: enumOfKeys(CREDENTIAL_TYPES),
    password: z.string(),
    confirmPassword: z.string(),
    databaseName: z
      .string()
      .trim()
      .refine(
        (name) => !name || DATABASE_NAME_PATTERN.test(name),
        "Start with a letter; use letters, numbers and underscores.",
      ),
    storageEncrypted: z.boolean(),
    kmsKeyId: kmsKeyIdSchema,
    secretKmsKeyId: kmsKeyIdSchema,
  })
  .superRefine((form, context) => {
    // Secrets Manager tự sinh password: không kiểm hai ô password
    if (form.credentials !== "selfManaged") return;

    // Floci nhận cả password AWS từ chối (đã kiểm 2026-11-23) nên console tự chặn theo luật AWS
    const maxLength = PASSWORD_MAX_LENGTHS[form.engine];
    const passwordError =
      form.password.length < PASSWORD_MIN_LENGTH || form.password.length > maxLength
        ? `Must be ${PASSWORD_MIN_LENGTH}–${maxLength} characters.`
        : !PASSWORD_PATTERN.test(form.password) && PASSWORD_RULE;

    if (passwordError) {
      context.addIssue({ code: "custom", path: ["password"], message: passwordError });
    }

    if (form.confirmPassword !== form.password) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords don't match.",
      });
    }
  });

export type CreateDatabaseForm = z.input<typeof createDatabaseSchema>;
export type NewDatabase = z.output<typeof createDatabaseSchema>;
