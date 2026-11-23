import { z } from "zod";
import { jsonText } from "@shared/schemas.ts";
import { EXECUTION_NAME_MAX_LENGTH } from "./constants.ts";

export const startExecutionSchema = z.object({
  // Bỏ trống thì Floci tự sinh UUID
  name: z
    .string()
    .trim()
    .max(EXECUTION_NAME_MAX_LENGTH, `Must be at most ${EXECUTION_NAME_MAX_LENGTH} characters.`)
    .regex(
      /^[a-zA-Z0-9._-]*$/,
      "Use only letters, numbers, periods (.), hyphens (-) and underscores (_).",
    ),
  input: jsonText.min(1, "Enter the input."),
});
