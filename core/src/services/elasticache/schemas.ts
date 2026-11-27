import { z } from "zod";
import { enumOfKeys } from "#shared/validation/schemas.ts";
import {
  CLUSTER_NAME_MAX_LENGTH,
  CLUSTER_NAME_PATTERN,
  DOUBLE_HYPHEN,
  ENGINE_LABELS,
  HYPHEN,
} from "./constants.ts";

export const createClusterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a cluster name.")
    .max(CLUSTER_NAME_MAX_LENGTH, `Must be at most ${CLUSTER_NAME_MAX_LENGTH} characters.`)
    .regex(CLUSTER_NAME_PATTERN, "Start with a letter; use lowercase letters, numbers and hyphens.")
    .refine((name) => !name.includes(DOUBLE_HYPHEN), "Can't contain two hyphens in a row.")
    .refine((name) => !name.endsWith(HYPHEN), "Can't end with a hyphen."),
  engine: enumOfKeys(ENGINE_LABELS),
});

export type CreateClusterForm = z.input<typeof createClusterSchema>;
