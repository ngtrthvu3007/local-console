import { z } from "zod";
import { enumOfKeys } from "@shared/schemas.ts";
import { PARAMETER_NAME_PATTERN, PARAMETER_PATH_SEPARATOR, PARAMETER_TYPES } from "./constants.ts";

const parameterName = z
  .string()
  .trim()
  .min(1, "Enter a parameter name.")
  .regex(PARAMETER_NAME_PATTERN, "Use only letters, numbers and _ . - /")
  .refine(
    (name) => !name.includes(PARAMETER_PATH_SEPARATOR) || name.startsWith(PARAMETER_PATH_SEPARATOR),
    "A name with / must start with /.",
  );

// Sửa thì tên bị khóa, không kiểm
export const parameterSchema = (editing: boolean) =>
  z.object({
    name: editing ? z.string() : parameterName,
    description: z.string().trim(),
    type: enumOfKeys(PARAMETER_TYPES),
    value: z.string().min(1, "Enter a value."),
  });

export type ParameterForm = z.input<ReturnType<typeof parameterSchema>>;
