import { z } from "zod";
import { enumOfKeys, lowercaseName } from "#shared/validation/schemas.ts";
import { CLUSTER_NAME_MAX_LENGTH, ENGINE_LABELS } from "./constants.ts";

export const createClusterSchema = z.object({
  name: lowercaseName("a cluster name", CLUSTER_NAME_MAX_LENGTH),
  engine: enumOfKeys(ENGINE_LABELS),
});

export type CreateClusterForm = z.input<typeof createClusterSchema>;
